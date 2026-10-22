import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpServer, WIDGET_URI } from '../server/mcp.js';
import { MemoryStore } from '../server/store.js';
import { ReadingService } from '../server/service.js';
import { createHttpServer } from '../server/http.js';
import { readConfig } from '../server/config.js';
import type { Snapshot } from '../domain/reading.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
const call = async (client: Client, name: string, args: Record<string, unknown>) => await client.callTool({ name, arguments: args }) as CallToolResult;

test('MCP discovers UI-only controls, serves HTML, and completes exactly the chosen spread', async () => {
  const service = new ReadingService(new MemoryStore());
  const server = createMcpServer(service, '<html><body>Tarot widget</body></html>');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-host', version: '1.0.0' });
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools(); assert.equal(tools.length, 7);
    const picker = tools.find(t => t.name === 'start_tarot_reading')!;
    assert.equal((picker._meta?.ui as { resourceUri: string }).resourceUri, WIDGET_URI);
    assert.deepEqual((tools.find(t => t.name === 'select_card')!._meta?.ui as { visibility: string[] }).visibility, ['app']);
    const resource = await client.readResource({ uri: WIDGET_URI }); assert.equal(resource.contents[0]!.mimeType, 'text/html;profile=mcp-app');
    const start = await call(client, 'start_tarot_reading', { locale: 'th' }); assert.equal(start.structuredContent?.locale, 'th');
    const configured = await call(client, 'configure_reading', { spreadId: 'horseshoe', reversals: true, locale: 'th' });
    let snapshot = configured.structuredContent?.snapshot as Snapshot;
    const accessToken = configured._meta!.accessToken as string;
    assert.equal(snapshot.cards.length, 0);
    const draw = await call(client, 'draw_remaining_cards', { readingId: snapshot.readingId, accessToken, revision: snapshot.revision, requestId: randomUUID() });
    snapshot = draw.structuredContent?.snapshot as Snapshot; assert.equal(snapshot.cards.length, 7);
    const complete = await call(client, 'complete_reading', { readingId: snapshot.readingId, accessToken, revision: snapshot.revision, requestId: randomUUID() });
    const finished = complete.structuredContent?.snapshot as Snapshot;
    assert.deepEqual(finished.cards, snapshot.cards); assert.equal(finished.status, 'completed');
    assert.equal(finished.cards[0]!.positionLabel, 'อิทธิพลจากอดีต');
    const invalid = await call(client, 'complete_reading', {}); assert.equal(invalid.isError, true);
  } finally { await client.close(); await server.close(); }
});

test('Streamable HTTP supports initialization and calls; rejects unexpected origins and methods', async () => {
  const config = readConfig({ PORT: '0' }); const service = new ReadingService(new MemoryStore());
  const server = createHttpServer(service, config, '<html>Widget</html>');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: 'http-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
    const result = await call(client, 'draw_tarot_spread', { spreadId: 'two-card', reversals: false, locale: 'en' });
    assert.equal((result.structuredContent?.reading as { cards: unknown[] }).cards.length, 2);
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    assert.equal((await fetch(`${url}/mcp`, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${url}/mcp`)).status, 405);
    assert.equal((await fetch(`${url}/preview`)).status, 404);
    assert.equal((await fetch(`${url}/api/tool`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not JSON' })).status, 400);
    assert.equal((await fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(40_000) }) })).status, 413);
    const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${url}/healthz`, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(invalidHostStatus, 403);
  } finally { await client.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('preview new-session requests are rate limited', async () => {
  const server = createHttpServer(new ReadingService(new MemoryStore()), readConfig({ ENABLE_PREVIEW: 'true' }), '<html>Widget</html>');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/api/tool`;
  try {
    let status = 0;
    for (let i = 0; i < 21; i++) status = (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'configure_reading', arguments: { spreadId: 'one-card', reversals: false, locale: 'en' } }) })).status;
    assert.equal(status, 429);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
