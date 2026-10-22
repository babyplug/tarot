import type { RedisClientType } from 'redis';
import { ReadingError, type Reading } from '../domain/reading.js';

export interface ReadingStore {
  insert(reading: Reading): Promise<void>;
  get(id: string): Promise<Reading | null>;
  compareAndSet(expectedRevision: number, reading: Reading): Promise<boolean>;
}

export class MemoryStore implements ReadingStore {
  private values = new Map<string, Reading>();
  constructor(private now = Date.now, private capacity = 5000) {}
  async insert(reading: Reading) {
    for (const [id, value] of this.values) if (value.expiresAt <= this.now()) this.values.delete(id);
    if (this.values.size >= this.capacity) throw new ReadingError('CAPACITY', 'The service is busy. Please try again later.');
    this.values.set(reading.id, structuredClone(reading));
  }
  async get(id: string) {
    const value = this.values.get(id);
    return value ? structuredClone(value) : null;
  }
  async compareAndSet(expectedRevision: number, reading: Reading) {
    const current = this.values.get(reading.id);
    if (!current || current.expiresAt <= this.now() || current.revision !== expectedRevision || current.expiresAt > reading.expiresAt) return false;
    this.values.set(reading.id, structuredClone(reading));
    return true;
  }
}

// One key per reading; the revision check and write happen atomically on Redis.
const CAS = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local current = cjson.decode(raw)
if current.revision ~= tonumber(ARGV[1]) then return 0 end
local next = cjson.decode(ARGV[2])
if current.expiresAt > next.expiresAt then return 0 end
local ttl = next.expiresAt - tonumber(ARGV[3])
if ttl <= 0 then return 0 end
-- Preserve JSON arrays verbatim; Redis cjson re-encodes empty arrays as objects.
redis.call('SET', KEYS[1], ARGV[2], 'PX', ttl)
return 1
`;
export class RedisStore implements ReadingStore {
  constructor(private client: RedisClientType, private now = Date.now) {}
  private key(id: string) { return `tarot:reading:${id}`; }
  async insert(reading: Reading) {
    const result = await this.client.set(this.key(reading.id), JSON.stringify(reading), { NX: true, PX: Math.max(1, reading.expiresAt - this.now()) });
    if (result !== 'OK') throw new Error('Reading identifier collision');
  }
  async get(id: string) {
    const value = await this.client.get(this.key(id));
    return value === null ? null : JSON.parse(value) as Reading;
  }
  async compareAndSet(expectedRevision: number, reading: Reading) {
    return Number(await this.client.eval(CAS, {
      keys: [this.key(reading.id)], arguments: [String(expectedRevision), JSON.stringify(reading), String(this.now())],
    })) === 1;
  }
}
