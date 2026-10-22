import { App } from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

type State = { readingId: string; page: number };
declare global {
  interface Window {
    openai?: { widgetState?: State; setWidgetState?: (state: State | null) => void };
  }
}
const preview = window.parent === window;
const app = preview ? null : new App({ name: 'tarot-card-selection', version: '0.1.0' }, {}, { autoResize: true });
const listeners = new Set<(result: CallToolResult) => void>();
let last: CallToolResult | undefined;
let widgetKey: string | undefined;
if (app) app.ontoolresult = result => {
  last = result as CallToolResult;
  if (typeof result._meta?.widgetId === 'string') widgetKey = result._meta.widgetId;
  for (const listener of listeners) listener(last);
};
const ready = app ? app.connect(undefined, { timeout: 15_000 }) : Promise.resolve();
// Install a rejection handler immediately; UI surfaces connection failures when calling a tool.
void ready.catch(() => {});

export class ToolError extends Error { constructor(public code: string, message: string) { super(message); } }
export const bridge = {
  preview,
  subscribe(listener: (result: CallToolResult) => void) {
    listeners.add(listener); if (last) listener(last);
    return () => { listeners.delete(listener); };
  },
  async call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    let result: CallToolResult;
    if (preview) {
      const response = await fetch('/api/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new ToolError(response.status === 429 ? 'RATE_LIMIT' : 'NETWORK', `Request failed (${response.status}). Please try again.`);
      result = await response.json() as CallToolResult;
    } else {
      await ready;
      result = await app!.callServerTool({ name, arguments: args }, { timeout: 15_000 });
    }
    if (result.isError) {
      const error = result.structuredContent?.error as { code?: string; message?: string } | undefined;
      throw new ToolError(error?.code ?? 'UNAVAILABLE', error?.message ?? 'The request failed. Please retry.');
    }
    return result;
  },
  async interpret(text: string, reading: Record<string, unknown>) {
    if (!app) return false; // A local test page cannot create a real ChatGPT response.
    await ready;
    // Include the exact cards in the message as well, so hosts lacking context updates still work.
    try { await app.updateModelContext({ structuredContent: { reading } }, { timeout: 8_000 }); } catch { /* message is self-contained */ }
    const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] }, { timeout: 15_000 });
    if (result.isError) throw new ToolError('HANDOFF', 'ChatGPT could not receive the reading. Copy the spread into the conversation.');
    return true;
  },
  load(): (State & { accessToken: string }) | null {
    try {
      const stored = sessionStorage.getItem(preview ? 'tarot-preview-state' : `tarot-widget:${widgetKey}`);
      const state = (preview || widgetKey ? JSON.parse(stored ?? 'null') as State | null : null) ?? window.openai?.widgetState;
      if (!state?.readingId) return null;
      const accessToken = sessionStorage.getItem(`tarot-token:${state.readingId}`);
      return accessToken ? { ...state, accessToken } : null;
    } catch { return null; }
  },
  save(state: State, accessToken: string) {
    try {
      sessionStorage.setItem(`tarot-token:${state.readingId}`, accessToken);
      if (preview) sessionStorage.setItem('tarot-preview-state', JSON.stringify(state));
      else {
        if (widgetKey) sessionStorage.setItem(`tarot-widget:${widgetKey}`, JSON.stringify(state));
        window.openai?.setWidgetState?.(state); // Capabilities never enter widgetState or model context.
      }
    } catch { /* Active reading still works when host storage is unavailable. */ }
  },
  clear(readingId?: string) {
    try {
      if (readingId) sessionStorage.removeItem(`tarot-token:${readingId}`);
      if (preview) sessionStorage.removeItem('tarot-preview-state');
      else {
        if (widgetKey) sessionStorage.removeItem(`tarot-widget:${widgetKey}`);
        window.openai?.setWidgetState?.(null);
      }
    } catch { /* Storage can be disabled by the host. */ }
  },
};
