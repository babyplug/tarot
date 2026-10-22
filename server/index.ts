import { readFile } from 'node:fs/promises';
import { createClient } from 'redis';
import { readConfig } from './config.js';
import { MemoryStore, RedisStore } from './store.js';
import { ReadingService } from './service.js';
import { createHttpServer } from './http.js';

const config = readConfig();
const redis = config.STORE === 'redis' ? createClient({ url: config.REDIS_URL }) : null;
redis?.on('error', () => console.error('Redis connection error'));
if (redis) await redis.connect();
const store = redis ? new RedisStore(redis) : new MemoryStore();
const service = new ReadingService(store, config.IDLE_TTL_SECONDS * 1000, config.MAX_TTL_SECONDS * 1000);
const widget = await readFile('dist/widget.html', 'utf8');
const server = createHttpServer(service, config, widget);
server.listen(config.PORT, config.HOST, () => console.log(`Tarot listening on ${config.HOST}:${config.PORT}; MCP at /mcp`));
const shutdown = () => { server.close(() => { void redis?.quit().finally(() => process.exit(0)); if (!redis) process.exit(0); }); };
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
