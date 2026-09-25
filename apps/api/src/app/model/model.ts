import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cut } from '../core/lines';
import { wav } from '../song';
import { gemini } from './gemini';
import { openai } from './openai';
import type { Clip, Provider } from './provider';

const PROVIDERS: Provider[] = [openai, gemini];
const PROTOTYPE_STYLE = 'warm, calm and slow, like a kind family friend talking to an older woman';
const logger = new Logger('Model');

// Read on every call, because main.ts loads .env.local after the imports.
function selected(): Provider {
  const name = process.env.ANCHOR_MODEL_PROVIDER || 'openai';
  const provider = PROVIDERS.find((item) => item.name === name);
  if (!provider) throw new Error(`Unknown model provider ${name}`);
  return provider;
}

/** Checks every answer field in code, because the response schema may ignore enum, minimum, and maximum. */
export const valid = {
  oneOf: <T extends string>(value: unknown, allowed: readonly T[]) => (allowed.includes(value as T) ? (value as T) : undefined),
  int: (value: unknown, min: number, max: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined,
  text: (value: unknown, max = Infinity) => (typeof value === 'string' ? cut(value.trim(), max) : ''),
  strings: (value: unknown) => (Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : []),
  date: (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return undefined;
    const time = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value) ? value : undefined;
  },
};

// ponytail: every answer is cached on disk, because the free tier allows about 10 TTS requests per model per day
// One directory per provider, so a switch never serves the answer of the other provider, and the keys of the older caches still hit.
async function cached(provider: Provider, key: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  const dir = join(tmpdir(), `anchor-${provider.name}`);
  const file = join(dir, createHash('sha1').update(key).digest('hex'));
  try {
    if (existsSync(file)) return readFileSync(file);
  } catch {
    /* cache miss */
  }
  const data = await produce();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, data);
  } catch {
    /* Vercel filesystem is ephemeral; the answer is still returned */
  }
  return data;
}

export async function ask<T>(
  prompt: string,
  schema: object,
  options: { audio?: Clip; media?: Clip[]; fast?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { audio, fast = false } = options;
  const media = [...(options.media ?? []), ...(audio ? [audio] : [])];
  const timeoutMs = options.timeoutMs ?? (fast ? 9000 : 45000);
  const provider = selected();
  const produce = async () => {
    const text = await provider.ask(prompt, schema, media, { fast, timeoutMs });
    JSON.parse(text); // throws before the cache stores an answer that does not parse
    return Buffer.from(text);
  };
  const hashes = media.map((item) => createHash('sha1').update(item.data).digest('hex'));
  const key = `ask:${prompt}:${JSON.stringify(schema)}:${hashes.join(',')}`;
  return JSON.parse((await cached(provider, key, produce)).toString());
}

export async function transcribe(clip: Clip): Promise<string> {
  try {
    const result = await ask<{ transcript?: unknown }>(
      'Transcribe this voice note verbatim. Return an empty string when nobody speaks.',
      { type: 'object', properties: { transcript: { type: 'string' } }, required: ['transcript'] },
      { media: [clip], fast: true, timeoutMs: 30000 },
    );
    return valid.text(result.transcript);
  } catch (error) {
    logger.warn(`Transcription failed: ${error}`);
    return '';
  }
}

export async function speak(text: string, style = PROTOTYPE_STYLE): Promise<Buffer> {
  const provider = selected();
  // ponytail: the default key predates the style, so the prototype keeps its cached clips; drop the branch with the prototype
  const key = style === PROTOTYPE_STYLE ? `speak:${provider.voice}:${text}` : `speak:${provider.voice}:${style}:${text}`;
  const audio = await cached(provider, key, () => provider.speak(text, style));
  // ponytail: a Gemini clip cached before the seam can hold raw 24 kHz PCM; drop the branch when those caches age out
  return provider.name === 'gemini' && audio.subarray(0, 4).toString() !== 'RIFF' ? wav(audio, 24000) : audio;
}
