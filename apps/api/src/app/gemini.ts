import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wav } from './song';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TEXT_MODELS = [process.env.GEMINI_MODEL ?? 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
const TTS_MODELS = [
  process.env.GEMINI_TTS_MODEL ?? 'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
];
const VOICE = process.env.GEMINI_VOICE ?? 'Sulafat';
const CACHE = join(process.cwd(), 'tmp', 'gemini');

type Content = { type: string; text?: string; data?: string };

// ponytail: every answer is cached on disk, because the free tier allows about 10 TTS requests per model per day
async function cached(key: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  const file = join(CACHE, createHash('sha1').update(key).digest('hex'));
  if (existsSync(file)) return readFileSync(file);
  const data = await produce();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, data);
  return data;
}

// ponytail: an overloaded or rate-limited model (429 or 503) falls through to the next one, no backoff
async function interact(models: string[], body: object | ((model: string) => object), timeoutMs: number): Promise<Content[]> {
  const deadline = AbortSignal.timeout(timeoutMs);
  for (const [index, model] of models.entries()) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ model, ...(typeof body === 'function' ? body(model) : body) }),
      signal: deadline,
    });
    if ((response.status === 429 || response.status === 503) && index < models.length - 1) continue;
    if (!response.ok) throw new Error(`Gemini ${model} ${response.status}: ${await response.text()}`);
    const interaction = (await response.json()) as { steps: { type: string; content?: Content[] }[] };
    return interaction.steps.filter((step) => step.type === 'model_output').flatMap((step) => step.content ?? []);
  }
  throw new Error('Gemini: no model left');
}

export async function ask<T>(
  prompt: string,
  schema: object,
  options: { audio?: { data: Buffer; mimeType: string }; fast?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { audio, fast, timeoutMs } = options;
  const input = audio
    ? [{ type: 'text', text: prompt }, { type: 'audio', data: audio.data.toString('base64'), mime_type: audio.mimeType }]
    : prompt;
  const produce = async () => {
    const content = await interact(
      fast ? FAST_MODELS : TEXT_MODELS,
      { input, response_format: { type: 'text', mime_type: 'application/json', schema } },
      timeoutMs ?? (fast ? 9000 : 45000),
    );
    return Buffer.from(content.filter((item) => item.type === 'text').map((item) => item.text).join(''));
  };
  const key = `ask:${prompt}:${JSON.stringify(schema)}:${audio ? createHash('sha1').update(audio.data).digest('hex') : ''}`;
  return JSON.parse((await cached(key, produce)).toString());
}

export async function speak(text: string): Promise<Buffer> {
  const audio = await cached(`speak:${VOICE}:${text}`, async () => {
    const style = 'warm, calm and slow, like a kind nurse talking to an older Greek woman';
    const content = await interact(
      TTS_MODELS,
      (model) => ({
        input: [
          {
            type: 'user_input',
            content: [
              model.startsWith('gemini-3.8')
                ? { type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }
                : { type: 'text', text: `Say in a ${style} voice: ${text}` },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: VOICE }] },
      }),
      30000,
    );
    const audio = content.filter((item) => item.type === 'audio').at(-1);
    if (!audio?.data) throw new Error('Gemini returned no audio');
    return Buffer.from(audio.data, 'base64');
  });
  return audio.subarray(0, 4).toString() === 'RIFF' ? audio : wav(audio, 24000);
}
