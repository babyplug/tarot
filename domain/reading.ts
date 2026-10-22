import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { CARD_BY_ID, CARDS, SPREADS, type Card, type Locale, type Orientation, type SpreadId } from './catalog.js';

export class ReadingError extends Error {
  constructor(public code: 'NOT_FOUND' | 'EXPIRED' | 'CONFLICT' | 'INVALID_SLOT' | 'INCOMPLETE' | 'COMPLETED' | 'RETRY_MISMATCH' | 'CAPACITY', message: string) { super(message); }
}
export interface Settings { spreadId: SpreadId; reversals: boolean; locale: Locale }
interface Slot { id: string; cardId: string; orientation: Orientation }
export interface Selection { slotId: string; position: number; cardId: string; orientation: Orientation }
export interface Reading {
  id: string; tokenHash: string; settings: Settings; slots: Slot[]; selected: Selection[];
  revision: number; createdAt: number; expiresAt: number; maxExpiresAt: number; completed: boolean;
  requests: Record<string, { fingerprint: string }>;
}
export interface RevealedCard extends Card { position: number; positionLabel: string; orientation: Orientation; meaning: string }
export interface Snapshot {
  readingId: string; revision: number; settings: Settings; spreadName: string;
  labels: string[]; slots: { id: string; selected: boolean }[]; cards: RevealedCard[];
  status: 'selecting' | 'ready' | 'completed'; expiresAt: number;
}
export type RandomIndex = (exclusiveMax: number) => number;

export function shuffle<T>(items: readonly T[], next: RandomIndex = randomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = next(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid random index');
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function authorize(reading: Reading | null, token: string, now: number): asserts reading is Reading {
  if (!reading || !timingSafeEqual(Buffer.from(reading.tokenHash, 'hex'), Buffer.from(tokenHash(token), 'hex'))) {
    throw new ReadingError('NOT_FOUND', 'This reading is unavailable. Start a new reading.');
  }
  if (reading.expiresAt <= now) throw new ReadingError('EXPIRED', 'This reading has expired. Start a new reading.');
}
export function createReading(settings: Settings, now: number, idleMs: number, maxMs: number, next: RandomIndex = randomInt) {
  const accessToken = randomBytes(32).toString('base64url');
  const reading: Reading = {
    id: randomUUID(), tokenHash: tokenHash(accessToken), settings,
    slots: shuffle(CARDS, next).map(card => ({ id: randomUUID(), cardId: card.id, orientation: settings.reversals && next(2) === 1 ? 'reversed' : 'upright' })),
    selected: [], revision: 0, createdAt: now, expiresAt: now + Math.min(idleMs, maxMs),
    maxExpiresAt: now + maxMs, completed: false, requests: {},
  };
  return { reading, accessToken };
}
export function snapshot(reading: Reading): Snapshot {
  const { locale, spreadId } = reading.settings;
  const labels = [...SPREADS[spreadId].labels[locale]];
  return {
    readingId: reading.id, revision: reading.revision, settings: reading.settings,
    spreadName: SPREADS[spreadId].name[locale], labels,
    slots: reading.slots.map(slot => ({ id: slot.id, selected: reading.selected.some(s => s.slotId === slot.id) })),
    cards: reading.selected.map(selection => {
      const card = CARD_BY_ID.get(selection.cardId)!;
      return { ...card, position: selection.position, positionLabel: labels[selection.position]!, orientation: selection.orientation, meaning: card[selection.orientation] };
    }),
    status: reading.completed ? 'completed' : reading.selected.length === labels.length ? 'ready' : 'selecting',
    expiresAt: reading.expiresAt,
  };
}

export type Action = { type: 'select'; slotId: string } | { type: 'auto' } | { type: 'complete' };
export interface Mutation { revision: number; requestId: string; action: Action }
export function mutate(reading: Reading, input: Mutation, now: number, idleMs: number): Reading {
  const fingerprint = JSON.stringify(input.action);
  const previous = Object.hasOwn(reading.requests, input.requestId) ? reading.requests[input.requestId] : undefined;
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new ReadingError('RETRY_MISMATCH', 'This retry does not match the original action.');
    return reading; // Return current authoritative state; do not consume more cards.
  }
  if (reading.revision !== input.revision) throw new ReadingError('CONFLICT', 'The reading changed. Refresh it before selecting again.');
  if (reading.completed) throw new ReadingError('COMPLETED', 'This reading is complete. Start a new reading to draw again.');
  const count = SPREADS[reading.settings.spreadId].labels.en.length;
  const updated = structuredClone(reading);
  const add = (slot: Slot) => updated.selected.push({ slotId: slot.id, position: updated.selected.length, cardId: slot.cardId, orientation: slot.orientation });
  if (input.action.type === 'complete') {
    if (updated.selected.length !== count) throw new ReadingError('INCOMPLETE', 'Select every card before requesting a reading.');
    updated.completed = true;
  } else {
    if (updated.selected.length >= count) throw new ReadingError('COMPLETED', 'All positions are filled. Read these cards or start a new reading.');
    if (input.action.type === 'select') {
      const slotId = input.action.slotId;
      const slot = updated.slots.find(slot => slot.id === slotId);
      if (!slot || updated.selected.some(selection => selection.slotId === slot.id)) throw new ReadingError('INVALID_SLOT', 'Choose an available face-down card.');
      add(slot);
    } else {
      // The remaining deck is already uniformly shuffled. Draw its first available slots.
      for (const slot of updated.slots) {
        if (updated.selected.length === count) break;
        if (!updated.selected.some(selection => selection.slotId === slot.id)) add(slot);
      }
    }
  }
  updated.revision++;
  updated.expiresAt = Math.min(now + idleMs, updated.maxExpiresAt);
  updated.requests[input.requestId] = { fingerprint };
  return updated;
}
