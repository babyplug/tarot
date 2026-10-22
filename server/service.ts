import { authorize, createReading, mutate, ReadingError, snapshot, type Mutation, type Settings } from '../domain/reading.js';
import type { ReadingStore } from './store.js';

export class ReadingService {
  constructor(public store: ReadingStore, private idleMs = 7_200_000, private maxMs = 86_400_000, private now = Date.now) {}
  async create(settings: Settings) {
    const { reading, accessToken } = createReading(settings, this.now(), this.idleMs, this.maxMs);
    await this.store.insert(reading);
    return { snapshot: snapshot(reading), accessToken };
  }
  async get(readingId: string, accessToken: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const reading = await this.store.get(readingId);
      const now = this.now();
      authorize(reading, accessToken, now);
      const touched = { ...reading, expiresAt: Math.min(now + this.idleMs, reading.maxExpiresAt) };
      if (await this.store.compareAndSet(reading.revision, touched)) return snapshot(touched);
    }
    throw new ReadingError('CONFLICT', 'The reading changed. Please refresh it.');
  }
  async change(readingId: string, accessToken: string, mutation: Mutation) {
    const reading = await this.store.get(readingId);
    const now = this.now();
    authorize(reading, accessToken, now);
    const next = mutate(reading, mutation, now, this.idleMs);
    if (next === reading) return snapshot(reading);
    if (await this.store.compareAndSet(reading.revision, next)) return snapshot(next);
    // A duplicate request may have won the race. Replay only an identical request.
    const current = await this.store.get(readingId);
    authorize(current, accessToken, this.now());
    if (Object.hasOwn(current.requests, mutation.requestId)) return snapshot(mutate(current, mutation, this.now(), this.idleMs));
    throw new ReadingError('CONFLICT', 'Another selection completed first. Refresh before choosing another card.');
  }
}
