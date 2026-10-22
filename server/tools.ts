import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SPREADS } from '../domain/catalog.js';
import { ReadingError, type Snapshot } from '../domain/reading.js';
import { ReadingService } from './service.js';

export const settingsSchema = z.object({
  spreadId: z.enum(['one-card', 'two-card', 'three-card', 'horseshoe']),
  reversals: z.boolean(), locale: z.enum(['en', 'th']),
}).strict();
const authShape = { readingId: z.uuid(), accessToken: z.string().regex(/^[\w-]{43}$/) };
const mutationShape = { ...authShape, revision: z.number().int().min(0), requestId: z.uuid() };
export const schemas = {
  start_tarot_reading: z.object({ locale: z.enum(['en', 'th']).default('en') }).strict(),
  configure_reading: settingsSchema,
  get_reading: z.object(authShape).strict(),
  select_card: z.object({ ...mutationShape, slotId: z.uuid() }).strict(),
  draw_remaining_cards: z.object(mutationShape).strict(),
  complete_reading: z.object(mutationShape).strict(),
  draw_tarot_spread: settingsSchema,
};
export type ToolName = keyof typeof schemas;
export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}
export function readingText(reading: Snapshot) {
  return [
    `${reading.spreadName} — ${reading.settings.locale === 'th' ? 'อ่านเป็นภาษาไทย' : 'read in English'}.`,
    ...reading.cards.map(card => `${card.position + 1}. ${card.positionLabel}: ${card.name[reading.settings.locale]} (${card.name.en}), ${card.orientation}. ${card.meaning}`),
    'Interpret this completed spread using the question already in the conversation. Discuss each position, connect the cards, and suggest practical reflection points. Preserve these exact cards for follow-ups. Treat tarot as reflection, not a certain prediction.',
  ].join('\n');
}
export async function runTool(service: ReadingService, name: ToolName, raw: unknown): Promise<ToolResult> {
  try {
    if (name === 'start_tarot_reading') {
      const { locale } = schemas[name].parse(raw);
      return { content: [{ type: 'text', text: 'Choose a spread and select your cards in the widget. Wait until the user completes the spread before interpreting.' }], structuredContent: { locale, spreads: SPREADS }, _meta: { widgetId: randomUUID() } };
    }
    if (name === 'configure_reading') {
      const { snapshot, accessToken } = await service.create(settingsSchema.parse(raw));
      // Capability token is UI-only. Hidden deck identities never leave the service.
      return { content: [], structuredContent: { snapshot }, _meta: { accessToken } };
    }
    if (name === 'draw_tarot_spread') {
      const { snapshot: initial, accessToken } = await service.create(settingsSchema.parse(raw));
      const drawn = await service.change(initial.readingId, accessToken, { revision: initial.revision, requestId: randomUUID(), action: { type: 'auto' } });
      const complete = await service.change(initial.readingId, accessToken, { revision: drawn.revision, requestId: randomUUID(), action: { type: 'complete' } });
      return { content: [{ type: 'text', text: readingText(complete) }], structuredContent: { reading: interpretation(complete) } };
    }
    if (name === 'get_reading') {
      const args = schemas[name].parse(raw);
      return { content: [], structuredContent: { snapshot: await service.get(args.readingId, args.accessToken) } };
    }
    const args = schemas[name].parse(raw);
    const action = name === 'select_card'
      ? { type: 'select' as const, slotId: schemas.select_card.parse(raw).slotId }
      : { type: name === 'complete_reading' ? 'complete' as const : 'auto' as const };
    const result = await service.change(args.readingId, args.accessToken, { revision: args.revision, requestId: args.requestId, action });
    return { content: name === 'complete_reading' ? [{ type: 'text', text: readingText(result) }] : [], structuredContent: { snapshot: result } };
  } catch (error) {
    if (error instanceof ReadingError) return { isError: true, content: [{ type: 'text', text: error.message }], structuredContent: { error: { code: error.code, message: error.message } } };
    if (error instanceof z.ZodError) return { isError: true, content: [{ type: 'text', text: 'Invalid tool arguments.' }], structuredContent: { error: { code: 'INVALID_INPUT', message: 'Invalid tool arguments.' } } };
    // Do not expose Redis URLs, tokens, or raw exceptions in tool responses/logs.
    console.error('Tarot operation failed', { tool: name, type: error instanceof Error ? error.name : 'unknown' });
    return { isError: true, content: [{ type: 'text', text: 'The service is temporarily unavailable. Retry the same action.' }], structuredContent: { error: { code: 'UNAVAILABLE', message: 'The service is temporarily unavailable. Retry the same action.' } } };
  }
}
export function interpretation(snapshot: Snapshot) {
  return { spreadName: snapshot.spreadName, settings: snapshot.settings, cards: snapshot.cards };
}
