import { z } from 'zod';
const bool = z.enum(['true', 'false']).transform(value => value === 'true');
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(0).max(65535).default(8787),
  STORE: z.enum(['memory', 'redis']).default('memory'), REDIS_URL: z.string().url().optional(),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:8787'),
  IDLE_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(7200),
  MAX_TTL_SECONDS: z.coerce.number().int().min(1).max(86400).default(86400),
  ENABLE_PREVIEW: bool.default(false),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.parse(env);
  const origin = new URL(result.PUBLIC_ORIGIN);
  if (origin.origin !== result.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN must be an origin without a trailing slash or path');
  if (result.STORE === 'redis' && !result.REDIS_URL) throw new Error('REDIS_URL is required with STORE=redis');
  if (result.IDLE_TTL_SECONDS > result.MAX_TTL_SECONDS) throw new Error('Idle TTL must not exceed maximum TTL');
  if (result.NODE_ENV === 'production') {
    if (result.STORE !== 'redis') throw new Error('Production requires shared Redis storage');
    if (result.ENABLE_PREVIEW) throw new Error('Standalone preview must be disabled in production');
    if (origin.protocol !== 'https:') throw new Error('Production PUBLIC_ORIGIN must use HTTPS');
  }
  return result;
}
export type Config = ReturnType<typeof readConfig>;
