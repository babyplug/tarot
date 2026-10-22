import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../server/store.js';
import { ReadingService } from '../server/service.js';
import { runTool } from '../server/tools.js';
import { readConfig } from '../server/config.js';

const settings = { spreadId: 'three-card' as const, reversals: false, locale: 'en' as const };
function setup() { let time = 100; const clock = () => time; return { service: new ReadingService(new MemoryStore(clock), 1000, 3000, clock), tick: (value: number) => { time = value; } }; }
test('two simultaneous distinct clicks result in one selection and a revision conflict', async () => {
  const { service } = setup(); const { snapshot, accessToken } = await service.create(settings);
  const results = await Promise.allSettled(snapshot.slots.slice(0, 2).map(slot => service.change(snapshot.readingId, accessToken, { revision: 0, requestId: randomUUID(), action: { type: 'select', slotId: slot.id } })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await service.get(snapshot.readingId, accessToken)).cards.length, 1);
});
test('simultaneous retries of the same request produce one authoritative selection', async () => {
  const { service } = setup(); const { snapshot, accessToken } = await service.create(settings);
  const mutation = { revision: 0, requestId: randomUUID(), action: { type: 'select' as const, slotId: snapshot.slots[0]!.id } };
  const results = await Promise.all([service.change(snapshot.readingId, accessToken, mutation), service.change(snapshot.readingId, accessToken, mutation)]);
  assert.deepEqual(results[0], results[1]); assert.equal(results[0]!.cards.length, 1);
});
test('session access is isolated and wrong capabilities do not reveal existence', async () => {
  const { service } = setup(); const first = await service.create(settings); const second = await service.create(settings);
  await assert.rejects(service.get(first.snapshot.readingId, second.accessToken), { code: 'NOT_FOUND' });
  await assert.rejects(service.get(randomUUID(), first.accessToken), { code: 'NOT_FOUND' });
});
test('activity refreshes idle TTL without extending the maximum lifetime', async () => {
  const { service, tick } = setup(); const first = await service.create(settings);
  tick(900); assert.equal((await service.get(first.snapshot.readingId, first.accessToken)).expiresAt, 1900);
  tick(1800); assert.equal((await service.get(first.snapshot.readingId, first.accessToken)).expiresAt, 2800);
  tick(2700); assert.equal((await service.get(first.snapshot.readingId, first.accessToken)).expiresAt, 3100);
  tick(3100); await assert.rejects(service.get(first.snapshot.readingId, first.accessToken), { code: 'EXPIRED' });
});
test('the service can resume a reading with a new service instance sharing the store', async () => {
  const store = new MemoryStore(); const service = new ReadingService(store); const first = await service.create(settings);
  const resumed = await new ReadingService(store).get(first.snapshot.readingId, first.accessToken);
  assert.deepEqual(resumed.slots, first.snapshot.slots); assert.equal(resumed.cards.length, 0);
});
test('memory storage is bounded and expired sessions make room for new ones', async () => {
  let time = 100; const clock = () => time;
  const service = new ReadingService(new MemoryStore(clock, 1), 100, 1000, clock);
  await service.create(settings); await assert.rejects(service.create(settings), { code: 'CAPACITY' });
  time = 201; await service.create(settings);
});
test('tool validation rejects extra fields, invalid spreads, and invalid capabilities', async () => {
  const { service } = setup();
  for (const input of [{ ...settings, spreadId: 'unknown' }, { ...settings, question: 'unnecessary user data' }]) {
    const result = await runTool(service, 'configure_reading', input); assert.equal(result.isError, true);
  }
  const result = await runTool(service, 'get_reading', { readingId: randomUUID(), accessToken: 'x' }); assert.equal(result.isError, true);
});
test('capability is UI-only and automatic fallback returns a complete reading without it', async () => {
  const { service } = setup();
  const configured = await runTool(service, 'configure_reading', settings);
  assert.ok(configured._meta?.accessToken); assert.ok(!JSON.stringify(configured.structuredContent).includes('accessToken'));
  const auto = await runTool(service, 'draw_tarot_spread', settings);
  const reading = auto.structuredContent.reading as { cards: unknown[] };
  assert.equal(reading.cards.length, 3); assert.ok(!auto._meta); assert.match(auto.content[0]!.text, /question already in the conversation/);
});
test('production config requires Redis, HTTPS, and preview disabled', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /Redis/);
  assert.throws(() => readConfig({ STORE: 'redis' }), /REDIS_URL/);
  assert.throws(() => readConfig({ IDLE_TTL_SECONDS: '4', MAX_TTL_SECONDS: '3' }), /TTL/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', STORE: 'redis', REDIS_URL: 'redis://localhost', PUBLIC_ORIGIN: 'http://example.com' }), /HTTPS/);
  assert.equal(readConfig({ NODE_ENV: 'production', STORE: 'redis', REDIS_URL: 'redis://localhost', PUBLIC_ORIGIN: 'https://example.com' }).ENABLE_PREVIEW, false);
});
