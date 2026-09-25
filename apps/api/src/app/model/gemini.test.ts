import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { httpFetch, type HttpResponse } from '../http';
import { wav } from '../song';
import { gemini } from './gemini';
import { ask, speak, transcribe } from './model';

vi.mock('../http', () => ({ httpFetch: vi.fn() }));
const fetchMock = vi.mocked(httpFetch);

const answer = (content: object[]): HttpResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ steps: [{ type: 'model_output', content }] }),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
});
const json = (value: unknown) => answer([{ type: 'text', text: JSON.stringify(value) }]);
const request = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv('ANCHOR_MODEL_PROVIDER', 'gemini');
});

test('ask sends each media item as an image or audio input after the prompt', async () => {
  fetchMock.mockResolvedValue(json({ ok: true }));
  const prompt = `Describe the moment ${randomUUID()}`;
  await ask(prompt, { type: 'object' }, {
    media: [
      { data: Buffer.from('jpeg bytes'), mimeType: 'image/jpeg' },
      { data: Buffer.from('ogg bytes'), mimeType: 'audio/ogg' },
    ],
  });
  expect(request(0).input).toEqual([
    { type: 'text', text: prompt },
    { type: 'image', data: Buffer.from('jpeg bytes').toString('base64'), mime_type: 'image/jpeg' },
    { type: 'audio', data: Buffer.from('ogg bytes').toString('base64'), mime_type: 'audio/ogg' },
  ]);
});

test('ask keeps the audio option an audio input whatever its mime type', async () => {
  fetchMock.mockResolvedValue(json({ ok: true }));
  await ask(`Describe the voice note ${randomUUID()}`, { type: 'object' }, { audio: { data: Buffer.from('voice'), mimeType: '' } });
  expect(request(0).input[1].type).toBe('audio');
});

test('transcribe returns the trimmed transcript from a fast model', async () => {
  fetchMock.mockResolvedValue(json({ transcript: '  We went to Nafplio that summer  ' }));
  const clip = { data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' };
  expect(await transcribe(clip)).toBe('We went to Nafplio that summer');
  expect(request(0).model).toBe('gemini-3.5-flash-lite');
  expect(request(0).input[1]).toEqual({ type: 'audio', data: clip.data.toString('base64'), mime_type: 'audio/ogg' });
});

const cacheDir = join(tmpdir(), 'anchor-gemini');
const cacheFile = (key: string) => join(cacheDir, createHash('sha1').update(key).digest('hex'));
const cacheDefaultClip = (text: string, clip = wav(Buffer.alloc(8), 24000)) => {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile(`speak:Sulafat:${text}`), clip);
  return clip;
};

test('speak without a style reuses the clip that the prototype cached', async () => {
  const text = `Maria's first day at school ${randomUUID()}`;
  const clip = cacheDefaultClip(text);
  expect(await speak(text)).toEqual(clip);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('speak turns a raw PCM clip that the prototype cached into WAV', async () => {
  const text = `Maria's first day at school ${randomUUID()}`;
  const pcm = cacheDefaultClip(text, Buffer.alloc(8));
  expect(await speak(text)).toEqual(wav(pcm, 24000));
});

test('speak with a style asks for that style and caches it apart from the default', async () => {
  const text = `Maria's first day at school ${randomUUID()}`;
  cacheDefaultClip(text);
  fetchMock.mockResolvedValue(answer([{ type: 'audio', data: Buffer.alloc(8).toString('base64') }]));
  const style = 'warm, calm and slow, like a kind family friend talking to a grandparent';
  const audio = await speak(text, style);
  expect(audio.subarray(0, 4).toString()).toBe('RIFF');
  expect(request(0).input[0].content[0]).toEqual({ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] });
});

test('the Gemini provider speaks WAV, because transports/voice.ts converts WAV only', async () => {
  fetchMock.mockResolvedValue(answer([{ type: 'audio', data: Buffer.alloc(8).toString('base64') }]));
  const audio = await gemini.speak('Maria', 'warm');
  expect(audio.subarray(0, 4).toString()).toBe('RIFF');
  expect(audio).toEqual(wav(Buffer.alloc(8), 24000));
});
