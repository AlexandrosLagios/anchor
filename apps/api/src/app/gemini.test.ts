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

const answer = (content: object[]): HttpResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ steps: [{ type: 'model_output', content }] }),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
});
const json = (value: unknown) => answer([{ type: 'text', text: JSON.stringify(value) }]);
const failure: HttpResponse = { ...answer([]), ok: false, status: 500, text: async () => 'internal' };
const request = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body));

beforeEach(() => {
  fetchMock.mockReset();
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

test('ask caches no answer that does not parse, so the next call asks again', async () => {
  fetchMock.mockResolvedValueOnce(answer([])).mockResolvedValueOnce(json({ title: 'Nafplio' }));
  const prompt = `Title the moment ${randomUUID()}`;
  await expect(ask(prompt, { type: 'object' })).rejects.toThrow();
  expect(await ask(prompt, { type: 'object' })).toEqual({ title: 'Nafplio' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('ask caches per media item, so another photo with the same prompt gets its own answer', async () => {
  fetchMock.mockResolvedValueOnce(json({ title: 'first' })).mockResolvedValueOnce(json({ title: 'second' }));
  const prompt = `Title the moment ${randomUUID()}`;
  const photo = (bytes: string) => ({ media: [{ data: Buffer.from(bytes), mimeType: 'image/jpeg' }] });
  expect(await ask(prompt, { type: 'object' }, photo('photo one'))).toEqual({ title: 'first' });
  expect(await ask(prompt, { type: 'object' }, photo('photo two'))).toEqual({ title: 'second' });
  expect(await ask(prompt, { type: 'object' }, photo('photo one'))).toEqual({ title: 'first' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('transcribe returns the trimmed transcript from a fast model', async () => {
  fetchMock.mockResolvedValue(json({ transcript: '  We went to Nafplio that summer  ' }));
  const clip = { data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' };
  expect(await transcribe(clip)).toBe('We went to Nafplio that summer');
  expect(request(0).model).toBe('gemini-3.5-flash-lite');
  expect(request(0).input[1]).toEqual({ type: 'audio', data: clip.data.toString('base64'), mime_type: 'audio/ogg' });
});

test('transcribe returns an empty string for an invalid answer or a failed call', async () => {
  fetchMock.mockResolvedValueOnce(json({ transcript: 5 }));
  expect(await transcribe({ data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' })).toBe('');
  fetchMock.mockResolvedValue(failure);
  expect(await transcribe({ data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' })).toBe('');
});

const cacheFile = (key: string) => join(tmpdir(), 'anchor-gemini', createHash('sha1').update(key).digest('hex'));
const cacheDefaultClip = (text: string) => {
  const clip = wav(Buffer.alloc(8), 24000);
  mkdirSync(join(tmpdir(), 'anchor-gemini'), { recursive: true });
  writeFileSync(cacheFile(`speak:Sulafat:${text}`), clip);
  return clip;
};

test('speak without a style reuses the clip that the prototype cached', async () => {
  const text = `Maria's first day at school ${randomUUID()}`;
  const clip = cacheDefaultClip(text);
  expect(await speak(text)).toEqual(clip);
  expect(fetchMock).not.toHaveBeenCalled();
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
