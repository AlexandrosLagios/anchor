import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ask, speak, transcribe, valid } from './model';

const fake = vi.hoisted(() => ({ name: 'fake', voice: 'Calm', ask: vi.fn(), speak: vi.fn() }));
vi.mock('./gemini', () => ({ gemini: fake }));

const clip = (bytes: string) => ({ data: Buffer.from(bytes), mimeType: 'image/jpeg' });
const useProvider = (name: string) => {
  fake.name = name;
  vi.stubEnv('ANCHOR_MODEL_PROVIDER', name);
};

beforeEach(() => {
  fake.ask.mockReset();
  fake.speak.mockReset();
  useProvider('fake');
});

afterEach(() => {
  vi.unstubAllEnvs();
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

test('ask hands the provider the media with the audio clip last, and a timeout for the model tier', async () => {
  fake.ask.mockResolvedValue('{"ok":true}');
  const audio = { data: Buffer.from('voice'), mimeType: 'audio/ogg' };
  expect(await ask(`Title ${randomUUID()}`, { type: 'object' }, { media: [clip('photo')], audio })).toEqual({ ok: true });
  expect(fake.ask.mock.calls[0].slice(2)).toEqual([[clip('photo'), audio], { fast: false, timeoutMs: 45000 }]);
  await ask(`Title ${randomUUID()}`, { type: 'object' }, { fast: true });
  expect(fake.ask.mock.calls[1][3]).toEqual({ fast: true, timeoutMs: 9000 });
});

test('ask caches no answer that does not parse, so the next call asks again', async () => {
  fake.ask.mockResolvedValueOnce('').mockResolvedValueOnce('{"title":"Nafplio"}');
  const prompt = `Title the moment ${randomUUID()}`;
  await expect(ask(prompt, { type: 'object' })).rejects.toThrow();
  expect(await ask(prompt, { type: 'object' })).toEqual({ title: 'Nafplio' });
  expect(fake.ask).toHaveBeenCalledTimes(2);
});

test('ask caches per media item, so another photo with the same prompt gets its own answer', async () => {
  fake.ask.mockResolvedValueOnce('{"title":"first"}').mockResolvedValueOnce('{"title":"second"}');
  const prompt = `Title the moment ${randomUUID()}`;
  expect(await ask(prompt, { type: 'object' }, { media: [clip('photo one')] })).toEqual({ title: 'first' });
  expect(await ask(prompt, { type: 'object' }, { media: [clip('photo two')] })).toEqual({ title: 'second' });
  expect(await ask(prompt, { type: 'object' }, { media: [clip('photo one')] })).toEqual({ title: 'first' });
  expect(fake.ask).toHaveBeenCalledTimes(2);
});

test('ask caches per provider, so a switch never serves the other provider its answer', async () => {
  fake.ask.mockResolvedValueOnce('{"by":"fake"}').mockResolvedValueOnce('{"by":"other"}');
  const prompt = `Title the moment ${randomUUID()}`;
  expect(await ask(prompt, { type: 'object' })).toEqual({ by: 'fake' });
  useProvider('other');
  expect(await ask(prompt, { type: 'object' })).toEqual({ by: 'other' });
  useProvider('fake');
  expect(await ask(prompt, { type: 'object' })).toEqual({ by: 'fake' });
  expect(fake.ask).toHaveBeenCalledTimes(2);
});

test('ask rejects an unknown provider', async () => {
  vi.stubEnv('ANCHOR_MODEL_PROVIDER', 'nobody');
  await expect(ask(`Title ${randomUUID()}`, { type: 'object' })).rejects.toThrow('Unknown model provider nobody');
  expect(fake.ask).not.toHaveBeenCalled();
});

test('transcribe returns an empty string for an invalid answer or a failed call', async () => {
  fake.ask.mockResolvedValueOnce('{"transcript":5}').mockRejectedValueOnce(new Error('down'));
  expect(await transcribe({ data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' })).toBe('');
  expect(await transcribe({ data: Buffer.from(randomUUID()), mimeType: 'audio/ogg' })).toBe('');
});

test('speak caches per provider and returns the provider WAV', async () => {
  const first = Buffer.from('RIFF first');
  const second = Buffer.from('RIFF second');
  fake.speak.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const text = `Maria's first day at school ${randomUUID()}`;
  expect(await speak(text, 'warm')).toEqual(first);
  expect(await speak(text, 'warm')).toEqual(first);
  useProvider('other');
  expect(await speak(text, 'warm')).toEqual(second);
  expect(fake.speak).toHaveBeenCalledWith(text, 'warm');
  expect(fake.speak).toHaveBeenCalledTimes(2);
});
