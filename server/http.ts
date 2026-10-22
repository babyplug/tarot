import { createServer, type IncomingMessage } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp.js';
import { runTool, schemas, type ToolName } from './tools.js';
import type { ReadingService } from './service.js';
import type { Config } from './config.js';

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
async function jsonBody(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) throw new HttpError(413, 'Request too large');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new HttpError(400, 'Invalid JSON'); }
}
// Connection IP is used deliberately; arbitrary X-Forwarded-For must not bypass limits.
class RateLimiter {
  private buckets = new Map<string, { count: number; reset: number }>();
  allow(key: string, maximum: number) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      if (this.buckets.size > 4096) for (const [id, value] of this.buckets) if (value.reset <= now) this.buckets.delete(id);
      if (this.buckets.size > 8192) return false;
      bucket = { count: 0, reset: now + 60_000 }; this.buckets.set(key, bucket);
    }
    return ++bucket.count <= maximum;
  }
}
export function createHttpServer(service: ReadingService, config: Config, widgetHtml: string) {
  const limiter = new RateLimiter();
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', new URL(config.PUBLIC_ORIGIN).hostname]);
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const host = new URL(`http://${req.headers.host ?? 'localhost'}`).hostname;
      if (!allowedHosts.has(host)) throw new HttpError(403, 'Invalid host');
      if (req.headers.origin && req.headers.origin !== config.PUBLIC_ORIGIN) throw new HttpError(403, 'Origin not allowed');
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/healthz')) {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ service: 'tarot-card-selection', status: 'ok' })); return;
      }
      if (config.ENABLE_PREVIEW && req.method === 'GET' && url.pathname === '/preview') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; frame-ancestors 'none'; base-uri 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(widgetHtml); return;
      }
      const isMcp = url.pathname === '/mcp';
      const isPreviewApi = config.ENABLE_PREVIEW && url.pathname === '/api/tool';
      if (!isMcp && !isPreviewApi) throw new HttpError(404, 'Not found');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': config.PUBLIC_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type, mcp-protocol-version',
        }).end(); return;
      }
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
      if (!req.headers['content-type']?.includes('application/json')) throw new HttpError(415, 'Use application/json');
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (!limiter.allow(`requests:${ip}`, 300)) { res.setHeader('Retry-After', '60'); throw new HttpError(429, 'Too many requests'); }
      const body = await jsonBody(req);
      const payload = body as { method?: string; params?: { name?: string }; name?: string; arguments?: unknown } | null;
      const name = isMcp ? payload?.params?.name : payload?.name;
      if (['configure_reading', 'draw_tarot_spread'].includes(name ?? '') && !limiter.allow(`create:${ip}`, 20)) {
        res.setHeader('Retry-After', '60'); throw new HttpError(429, 'Too many new readings');
      }
      if (isPreviewApi) {
        if (!name || !Object.hasOwn(schemas, name)) throw new HttpError(400, 'Unknown tool');
        const result = await runTool(service, name as ToolName, payload?.arguments);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result)); return;
      }
      const server = createMcpServer(service, widgetHtml);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void server.close().catch(() => {}); });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'MCP request failed' }));
      }
    } catch (error) {
      if (!res.headersSent) res.writeHead(error instanceof HttpError ? error.status : 500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error instanceof HttpError ? error.message : 'Request failed' }));
    }
  });
}
