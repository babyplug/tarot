import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { runTool, schemas, type ToolName } from './tools.js';
import type { ReadingService } from './service.js';

export const WIDGET_URI = 'ui://tarot/card-selection-v1.html';
const descriptions: Record<ToolName, string> = {
  start_tarot_reading: 'Open interactive tarot card selection when the user wants to pick their own cards. The user chooses a spread and optional reversals. Do not interpret until all cards are selected.',
  configure_reading: 'Create a fresh shuffled reading from settings chosen in the widget. UI only.',
  get_reading: 'Recover an active reading using its UI session capability. UI only.',
  select_card: 'Reveal a face-down slot for the next spread position. UI only; do not choose on behalf of a user in manual mode.',
  draw_remaining_cards: 'Fill unselected positions from the same shuffled deck when the user presses Draw remaining. UI only.',
  complete_reading: 'Validate and finalize a fully selected spread for interpretation. UI only.',
  draw_tarot_spread: 'Automatically draw and return a completed tarot spread ONLY if the user explicitly requests an automatic draw or cannot use the interactive widget. Do not substitute this for manual card selection. Interpret the returned cards using the question already in the chat.',
};
const cardOutput = z.object({
  id: z.string(), name: z.object({ en: z.string(), th: z.string() }), position: z.number(),
  positionLabel: z.string(), orientation: z.enum(['upright', 'reversed']), meaning: z.string(),
}).passthrough();
const snapshotOutput = z.object({
  readingId: z.string(), revision: z.number(), settings: schemas.configure_reading,
  spreadName: z.string(), labels: z.array(z.string()), slots: z.array(z.object({ id: z.string(), selected: z.boolean() })),
  cards: z.array(cardOutput), status: z.enum(['selecting', 'ready', 'completed']), expiresAt: z.number(),
});
export function createMcpServer(service: ReadingService, widgetHtml: string) {
  const server = new McpServer({ name: 'tarot-card-selection', version: '0.1.0' });
  const uiMeta = { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } };
  registerAppResource(server, 'Tarot card selection', WIDGET_URI, { _meta: { ui: uiMeta } }, async () => ({
    contents: [{ uri: WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: widgetHtml, _meta: { ui: uiMeta } }],
  }));
  for (const name of Object.keys(schemas) as ToolName[]) {
    const modelTool = name === 'start_tarot_reading' || name === 'draw_tarot_spread';
    registerAppTool(server, name, {
      title: name.replaceAll('_', ' '), description: descriptions[name],
      inputSchema: schemas[name],
      outputSchema: z.object({ snapshot: snapshotOutput.optional() }).passthrough(),
      annotations: {
        readOnlyHint: name === 'start_tarot_reading' || name === 'get_reading',
        destructiveHint: false, openWorldHint: false,
        idempotentHint: !['configure_reading', 'draw_tarot_spread'].includes(name),
      },
      _meta: { ui: {
        ...(name === 'start_tarot_reading' ? { resourceUri: WIDGET_URI } : {}),
        visibility: modelTool ? ['model', 'app'] : ['app'],
      } },
    }, async (args: unknown) => runTool(service, name, args));
  }
  return server;
}
