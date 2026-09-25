import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cut } from './core/lines';
import { httpFetch } from './http';
import { wav } from './song';

const CHAT = 'https://api.openai.com/v1/chat/completions';
const TRANSCRIPTIONS = 'https://api.openai.com/v1/audio/transcriptions';
const SPEECH = 'https://api.openai.com/v1/audio/speech';
const TEXT_MODELS = [process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', 'gpt-4o-mini'];
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
const VOICE = process.env.OPENAI_VOICE ?? 'coral';
const CACHE = join(tmpdir(), 'anchor-openai');
const PROTOTYPE_STYLE = 'warm, calm and slow, like a kind family friend talking to an older woman';
const logger = new Logger('OpenAI');

type Clip = { data: Buffer; mimeType: string };
type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean;
};

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

async function cached(key: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  const file = join(CACHE, createHash('sha1').update(key).digest('hex'));
  try {
    if (existsSync(file)) return readFileSync(file);
  } catch {
    /* cache miss */
  }
  const data = await produce();
  try {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, data);
  } catch {
    /* Vercel filesystem is ephemeral; the answer is still returned */
  }
  return data;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = process.env.OPENAI_API_KEY ?? '';
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return { authorization: `Bearer ${key}`, ...extra };
}

function extension(mimeType: string): string {
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('webm')) return 'webm';
  return 'wav';
}

/** OpenAI transcription accepts OGG Opus. Chat audio input does not, so voice notes are transcribed first. */
async function transcribeClip(clip: Clip): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(clip.data)], { type: clip.mimeType || 'audio/ogg' }), `clip.${extension(clip.mimeType)}`);
  form.append('model', TRANSCRIBE_MODEL);
  const response = await httpFetch(TRANSCRIPTIONS, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`OpenAI transcribe ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { text?: string };
  return (body.text ?? '').trim();
}

/** Strict JSON schema requires every property to be required and additionalProperties: false. */
function strictSchema(schema: Schema): Schema {
  const copy: Schema = { ...schema };
  if (copy.type === 'object' && copy.properties) {
    copy.additionalProperties = false;
    copy.properties = Object.fromEntries(Object.entries(copy.properties).map(([key, value]) => [key, strictSchema(value)]));
    copy.required = Object.keys(copy.properties);
  }
  if (copy.type === 'array' && copy.items) copy.items = strictSchema(copy.items);
  return copy;
}

async function complete(prompt: string, schema: object, images: Clip[], timeoutMs: number): Promise<string> {
  const content = images.length
    ? [
        { type: 'text', text: prompt },
        ...images.map((item) => ({
          type: 'image_url',
          image_url: { url: `data:${item.mimeType};base64,${item.data.toString('base64')}` },
        })),
      ]
    : prompt;
  const deadline = AbortSignal.timeout(timeoutMs);
  for (const [index, model] of TEXT_MODELS.entries()) {
    const response = await httpFetch(CHAT, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'anchor_result', strict: true, schema: strictSchema(schema as Schema) },
        },
      }),
      signal: deadline,
    });
    if ((response.status === 429 || response.status === 503) && index < TEXT_MODELS.length - 1) continue;
    if (!response.ok) throw new Error(`OpenAI ${model} ${response.status}: ${await response.text()}`);
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error(`OpenAI ${model} returned no content`);
    JSON.parse(text);
    return text;
  }
  throw new Error('OpenAI: no model left');
}

export async function ask<T>(
  prompt: string,
  schema: object,
  options: { audio?: Clip; media?: Clip[]; fast?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { audio, fast, timeoutMs } = options;
  const media = [...(options.media ?? []), ...(audio ? [audio] : [])];
  const audioClips = media.filter((item) => !item.mimeType.startsWith('image/'));
  const images = media.filter((item) => item.mimeType.startsWith('image/'));
  const transcripts = await Promise.all(audioClips.map((clip) => transcribeClip(clip)));
  const spoken = transcripts.filter(Boolean);
  const text = spoken.length ? `${prompt}\n\nSpoken transcript: «${spoken.join('\n')}»` : prompt;
  const properties = (schema as Schema).properties ?? {};
  if (audioClips.length && !images.length && Object.keys(properties).length === 1 && 'transcript' in properties) {
    return { transcript: transcripts[0] ?? '' } as T;
  }
  const hashes = media.map((item) => createHash('sha1').update(item.data).digest('hex'));
  const key = `ask:${text}:${JSON.stringify(schema)}:${hashes.join(',')}`;
  const raw = await cached(key, async () => Buffer.from(await complete(text, schema, images, timeoutMs ?? (fast ? 9000 : 45000))));
  return JSON.parse(raw.toString()) as T;
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
    logger.warn(`OpenAI transcription failed: ${error}`);
    return '';
  }
}

export async function speak(text: string, style = PROTOTYPE_STYLE): Promise<Buffer> {
  const key = style === PROTOTYPE_STYLE ? `speak:${VOICE}:${text}` : `speak:${VOICE}:${style}:${text}`;
  const audio = await cached(key, async () => {
    const response = await httpFetch(SPEECH, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: VOICE,
        input: text,
        instructions: style,
        response_format: 'wav',
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`OpenAI speech ${response.status}: ${await response.text()}`);
    return Buffer.from(await response.arrayBuffer());
  });
  return audio.subarray(0, 4).toString() === 'RIFF' ? audio : wav(audio, 24000);
}
