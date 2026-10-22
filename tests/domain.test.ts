import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CARDS, SPREADS, type SpreadId } from '../domain/catalog.js';
import { createReading, mutate, ReadingError, shuffle, snapshot } from '../domain/reading.js';

const settings = { spreadId: 'three-card' as const, reversals: false, locale: 'en' as const };
const fresh = (spreadId: SpreadId = 'three-card', reversals = false) => createReading({ ...settings, spreadId, reversals }, 100, 1000, 5000, () => 0).reading;
test('catalog contains 78 unique bilingual cards with reference meanings', () => {
  assert.equal(CARDS.length, 78); assert.equal(new Set(CARDS.map(c => c.id)).size, 78);
  assert.equal(CARDS.filter(c => c.arcana === 'major').length, 22);
  for (const card of CARDS) for (const text of [card.name.en, card.name.th, card.upright, card.reversed]) assert.ok(text.length > 0);
});
test('shuffle uses inclusive zero and exclusive upper bound without mutating input', () => {
  const input = [0, 1, 2, 3]; const bounds: number[] = [];
  assert.deepEqual(shuffle(input, max => { bounds.push(max); return 0; }), [1, 2, 3, 0]);
  assert.deepEqual(bounds, [4, 3, 2]); assert.deepEqual(input, [0, 1, 2, 3]);
  assert.throws(() => shuffle(input, max => max), /Invalid random index/);
});
test('new snapshot contains no hidden card identities or session capability hash', () => {
  const view = snapshot(fresh()); assert.equal(view.cards.length, 0); assert.equal(view.slots.length, 78);
  for (const slot of view.slots) assert.deepEqual(Object.keys(slot).sort(), ['id', 'selected']);
  assert.ok(!JSON.stringify(view).includes('cardId')); assert.ok(!JSON.stringify(view).includes('tokenHash'));
});
test('manual selection reveals exactly the selected fixed slot', () => {
  const reading = fresh(); const slot = reading.slots[25]!;
  const next = mutate(reading, { revision: 0, requestId: randomUUID(), action: { type: 'select', slotId: slot.id } }, 200, 1000);
  assert.equal(next.selected[0]!.cardId, slot.cardId); assert.equal(next.selected[0]!.position, 0);
  assert.deepEqual(next.slots, reading.slots); assert.equal(reading.selected.length, 0);
  assert.equal(snapshot(next).cards.length, 1);
});
test('same slot cannot be selected twice', () => {
  let reading = fresh(); const slotId = reading.slots[0]!.id;
  reading = mutate(reading, { revision: 0, requestId: randomUUID(), action: { type: 'select', slotId } }, 200, 1000);
  assert.throws(() => mutate(reading, { revision: 1, requestId: randomUUID(), action: { type: 'select', slotId } }, 300, 1000), { code: 'INVALID_SLOT' });
});
test('unknown slots, incomplete readings, and stale revisions are rejected', () => {
  const reading = fresh();
  assert.throws(() => mutate(reading, { revision: 0, requestId: randomUUID(), action: { type: 'select', slotId: randomUUID() } }, 100, 1000), { code: 'INVALID_SLOT' });
  assert.throws(() => mutate(reading, { revision: 0, requestId: randomUUID(), action: { type: 'complete' } }, 100, 1000), { code: 'INCOMPLETE' });
  assert.throws(() => mutate(reading, { revision: 5, requestId: randomUUID(), action: { type: 'auto' } }, 100, 1000), { code: 'CONFLICT' });
});
test('retries do not consume cards and cannot change the original action', () => {
  const request = { revision: 0, requestId: randomUUID(), action: { type: 'select' as const, slotId: '' } };
  const initial = fresh(); request.action.slotId = initial.slots[0]!.id;
  const reading = mutate(initial, request, 200, 1000);
  assert.equal(mutate(reading, request, 300, 1000), reading);
  assert.throws(() => mutate(reading, { ...request, action: { type: 'auto' } }, 300, 1000), { code: 'RETRY_MISMATCH' });
});
for (const spreadId of Object.keys(SPREADS) as SpreadId[]) test(`${spreadId}: automatic draw fills only remaining positions and completion is immutable`, () => {
  let reading = fresh(spreadId); const first = reading.slots[30]!;
  reading = mutate(reading, { revision: 0, requestId: randomUUID(), action: { type: 'select', slotId: first.id } }, 200, 1000);
  if (SPREADS[spreadId].labels.en.length > 1) reading = mutate(reading, { revision: reading.revision, requestId: randomUUID(), action: { type: 'auto' } }, 300, 1000);
  assert.equal(reading.selected.length, SPREADS[spreadId].labels.en.length);
  assert.equal(reading.selected[0]!.cardId, first.cardId);
  assert.equal(new Set(reading.selected.map(s => s.cardId)).size, reading.selected.length);
  const request = { revision: reading.revision, requestId: randomUUID(), action: { type: 'complete' as const } };
  const complete = mutate(reading, request, 400, 1000);
  assert.equal(snapshot(complete).status, 'completed'); assert.equal(mutate(complete, request, 500, 1000), complete);
  assert.throws(() => mutate(complete, { revision: complete.revision, requestId: randomUUID(), action: { type: 'auto' } }, 500, 1000), ReadingError);
});
test('orientations are assigned once and reversed meaning matches the selected orientation', () => {
  const { reading } = createReading({ ...settings, reversals: true }, 100, 1000, 5000, max => max - 1);
  assert.ok(reading.slots.every(slot => slot.orientation === 'reversed'));
  const drawn = mutate(reading, { revision: 0, requestId: randomUUID(), action: { type: 'auto' } }, 200, 1000);
  for (const card of snapshot(drawn).cards) assert.equal(card.meaning, card.reversed);
  assert.ok(fresh().slots.every(slot => slot.orientation === 'upright'));
});
