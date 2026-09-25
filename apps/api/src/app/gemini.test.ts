import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { ask, speak, transcribe, valid } from './gemini';
import { httpFetch, type HttpResponse } from './http';
import { wav } from './song';

vi.mock('./http', () => ({ httpFetch: vi.fn() }));
const fetchMock = vi.mocked(httpFetch);

const chat = (value: unknown): HttpResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
});
const transcript = (text: string): HttpResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ text }),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
});
const speech = (audio: Buffer): HttpResponse => ({
  ok: true,
  status: 200,
  json: async () => ({}),
  text: async () => '',
  arrayBuffer: async () => audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
});
const failure: HttpResponse = { ...chat({}), ok: false, status: 500, text: async () => 'internal' };
const body = (call: number) => fetchMock.mock.calls[call][1]?.body;
const jsonBody = (call: number) => JSON.parse(String(body(call)));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.stubEnv('OPENAI_VOICE', 'coral');
});

test('valid.oneOf keeps an allowed value only', () => {
  const verdicts = ['family_moment', 'sensitive'] as const;
  expect(valid.oneOf('sensitive', verdicts)).toBe('sensitive');
  expect(valid.oneOf('SENSITIVE', verdicts)).toBeUndefined();
  expect(valid.oneOf(3, verdicts)).toBeUndefined();
});

test('valid.int keeps an integer inside the range only', () => {
  expect(valid.int(4, 1, 5)).toBe(4);
  expect(valid.int(0, 1, 5)).toBeUndefined();
  expect(valid.int(6, 1, 5)).toBeUndefined();
  expect(valid.int(2.5, 1, 5)).toBeUndefined();
  expect(valid.int('3', 1, 5)).toBeUndefined();
});

test('valid.text trims, caps the length, and turns a non-string into an empty string', () => {
  expect(valid.text('  Maria at school  ', 100)).toBe('Maria at school');
  expect(valid.text('x'.repeat(120), 100)).toBe('x'.repeat(100));
  expect(valid.text(5, 100)).toBe('');
  expect(valid.text(undefined)).toBe('');
  expect(valid.text(`${'x'.repeat(99)}😀`, 100)).toBe('x'.repeat(99));
});

test('valid.strings keeps an array of strings only', () => {
  expect(valid.strings(['Maria', 'Nikos'])).toEqual(['Maria', 'Nikos']);
  expect(valid.strings(['Maria', 3])).toEqual([]);
  expect(valid.strings('Maria')).toEqual([]);
});

test('valid.date keeps a real YYYY-MM-DD date only', () => {
  expect(valid.date('2019-09-25')).toBe('2019-09-25');
  expect(valid.date('2024-02-29')).toBe('2024-02-29');
  expect(valid.date('2026-02-30')).toBeUndefined();
  expect(valid.date('2026-13-01')).toBeUndefined();
  expect(valid.date('0000-09-25')).toBeUndefined();
  expect(valid.date('25/09/2019')).toBeUndefined();
  expect(valid.date('')).toBeUndefined();
});

test('ask transcribes OGG first and sends photos to the chat model', async () => {
  fetchMock.mockResolvedValueOnce(transcript('we went to Nafplio')).mockResolvedValueOnce(chat({ ok: true }));
  const prompt = `Describe the moment ${randomUUID()}`;
  await ask(prompt, { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, {
    media: [
      { data: Buffer.from('jpeg bytes'), mimeType: 'image/jpeg' },
      { data: Buffer.from('ogg bytes'), mimeType: 'audio/ogg' },
    ],
  });
  expect(String(fetchMock.mock.calls[0][0])).toContain('/audio/transcriptions');
  expect(body(0)).toBeInstanceOf(FormData);
  const sent = jsonBody(1);
  expect(sent.messages[0].content[0].text).toContain('Spoken transcript: «we went to Nafplio»');
  expect(sent.messages[0].content[1].type).toBe('image_url');
  expect(JSON.stringify(sent.messages[0].content)).not.toContain('ogg bytes');
});

test('ask treats the audio option as a voice note whatever its mime type', async () => {
  fetchMock.mockResolvedValueOnce(transcript('hello')).mockResolvedValueOnce(chat({ ok: true }));
  await ask(`Describe the voice note ${randomUUID()}`, { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }, {
    audio: { data: Buffer.from('voice'), mimeType: '' },
  });
  expect(String(fetchMock.mock.calls[0][0])).toContain('/audio/transcriptions');
  expect(jsonBody(1).messages[0].content).toContain('Spoken transcript: «hello»');
});

test('ask marks every property required and keeps enums for strict JSON schema', async () => {
  fetchMock.mockResolvedValue(chat({ verdict: 'family_moment', ids: ['m1'] }));
  const schema = {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['family_moment', 'sensitive'] },
      ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['verdict'],
  };
  await ask(`Judge ${randomUUID()}`, schema);
  const sent = jsonBody(0).response_format.json_schema.schema;
  expect(sent.additionalProperties).toBe(false);
  expect(sent.required).toEqual(['verdict', 'ids']);
  expect(sent.properties.verdict.enum).toEqual(['family_moment', 'sensitive']);
});

test('ask caches no answer that does not parse, so the next call asks again', async () => {
  fetchMock
    .mockResolvedValueOnce({ ...chat({}), json: async () => ({ choices: [{ message: { content: 'not-json' } }] }) })
    .mockResolvedValueOnce(chat({ title: 'Nafplio' }));
  const prompt = `Title the moment ${randomUUID()}`;
  const schema = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };
  await expect(ask(prompt, schema)).rejects.toThrow();
  expect(await ask(prompt, schema)).toEqual({ title: 'Nafplio' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('ask caches per media item, so another photo with the same prompt gets its own answer', async () => {
  fetchMock.mockResolvedValueOnce(chat({ title: 'first' })).mockResolvedValueOnce(chat({ title: 'second' }));
  const prompt = `Title the moment ${randomUUID()}`;
  const schema = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };
  const photo = (bytes: string) => ({ media: [{ data: Buffer.from(bytes), mimeType: 'image/jpeg' }] });
  expect(await ask(prompt, schema, photo('photo one'))).toEqual({ title: 'first' });
  expect(await ask(prompt, schema, photo('photo two'))).toEqual({ title: 'second' });
  expect(await ask(prompt, schema, photo('photo one'))).toEqual({ title: 'first' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('transcribe returns the trimmed transcript and sends OGG to the transcription endpoint', async () => {
  fetchMock.mockResolvedValue(transcript('  We went to Nafplio that summer  '));
  const clip = { data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' };
  expect(await transcribe(clip)).toBe('We went to Nafplio that summer');
  expect(String(fetchMock.mock.calls[0][0])).toContain('/audio/transcriptions');
  const form = body(0) as FormData;
  expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
  expect((form.get('file') as File).name).toBe('clip.ogg');
});

test('transcribe returns an empty string for a failed call', async () => {
  fetchMock.mockResolvedValue(failure);
  expect(await transcribe({ data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' })).toBe('');
});

const cacheDir = join(tmpdir(), 'anchor-openai');
const cacheFile = (key: string) => join(cacheDir, createHash('sha1').update(key).digest('hex'));

test('speak without a style returns WAV and reuses the cached clip', async () => {
  const text = `Maria's first day at school ${randomUUID()}`;
  const clip = wav(Buffer.alloc(8), 24000);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile(`speak:coral:${text}`), clip);
  expect(await speak(text)).toEqual(clip);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('speak with a style asks for that style and returns WAV', async () => {
  const text = `Maria's first day at school ${randomUUID()}`;
  const clip = wav(Buffer.alloc(8), 24000);
  fetchMock.mockResolvedValue(speech(clip));
  const style = 'warm, calm and slow, like a kind family friend talking to a grandparent';
  const audio = await speak(text, style);
  expect(audio.subarray(0, 4).toString()).toBe('RIFF');
  expect(jsonBody(0).response_format).toBe('wav');
  expect(jsonBody(0).instructions).toBe(style);
  expect(String(fetchMock.mock.calls[0][0])).toContain('/audio/speech');
});
