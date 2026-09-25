import { httpFetch } from '../http';
import { wav } from '../song';
import type { Clip, Provider } from './provider';

const CHAT = 'https://api.openai.com/v1/chat/completions';
const TRANSCRIPTIONS = 'https://api.openai.com/v1/audio/transcriptions';
const SPEECH = 'https://api.openai.com/v1/audio/speech';
const TEXT_MODELS = [process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', 'gpt-4o-mini'];
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts';
const VOICE = process.env.OPENAI_VOICE ?? 'coral';

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean;
};

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
    return text;
  }
  throw new Error('OpenAI: no model left');
}

export const openai: Provider = {
  name: 'openai',
  voice: VOICE,
  async ask(prompt, schema, media, { timeoutMs }) {
    const audioClips = media.filter((item) => !item.mimeType.startsWith('image/'));
    const images = media.filter((item) => item.mimeType.startsWith('image/'));
    const transcripts = await Promise.all(audioClips.map((clip) => transcribeClip(clip)));
    const properties = (schema as Schema).properties ?? {};
    if (audioClips.length && !images.length && Object.keys(properties).length === 1 && 'transcript' in properties) {
      return JSON.stringify({ transcript: transcripts[0] ?? '' });
    }
    const spoken = transcripts.filter(Boolean);
    const text = spoken.length ? `${prompt}\n\nSpoken transcript: «${spoken.join('\n')}»` : prompt;
    return complete(text, schema, images, timeoutMs);
  },
  async speak(text, style) {
    const response = await httpFetch(SPEECH, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ model: TTS_MODEL, voice: VOICE, input: text, instructions: style, response_format: 'wav' }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`OpenAI speech ${response.status}: ${await response.text()}`);
    const audio = Buffer.from(await response.arrayBuffer());
    return audio.subarray(0, 4).toString() === 'RIFF' ? audio : wav(audio, 24000);
  },
};
