process.env.TZ = 'Europe/Athens';

import { beforeEach, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { FakeTransport } from '../../core/fake-transport';
import type { Family, Incoming } from '../../core/types';
import { ask } from '../../model/model';
import { classify, validate } from './classify';
import type { Bundle } from './filter';

vi.mock('../../model/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../model/model')>()),
  ask: vi.fn(),
  transcribe: vi.fn(),
  speak: vi.fn(),
}));

const sender = { id: '1', name: 'Sofia' };
const family: Family = { id: '-100', chatId: '-100', members: [], moments: [], offers: [], reminders: [], counters: {} };

function event(overrides: Partial<Incoming> = {}): Incoming {
  return { chat: 'group', chatId: '-100', messageId: '1', sender, at: 0, ...overrides };
}

function bundle(events: Incoming[]): Bundle {
  return { family, sender, events };
}

const valid = {
  verdict: 'family_moment',
  salience: 4,
  people: ['Maria'],
  eventDate: '2026-09-01',
  title: "Maria's first day at school",
  tags: ['Maria', 'school'],
  transcript: '',
};

beforeEach(() => {
  vi.clearAllMocks();
});

test('validate rejects a raw answer that is not an object or holds no valid verdict', () => {
  expect(validate(undefined)).toBeUndefined();
  expect(validate('family_moment')).toBeUndefined();
  expect(validate({ ...valid, verdict: 'nonsense' })).toBeUndefined();
  expect(validate({ ...valid, verdict: undefined })).toBeUndefined();
});

test('validate defaults an invalid salience to 3, and keeps a valid one', () => {
  expect(validate({ ...valid, salience: 0 })?.salience).toBe(3);
  expect(validate({ ...valid, salience: 2.5 })?.salience).toBe(3);
  expect(validate({ ...valid, salience: 6 })?.salience).toBe(3);
  expect(validate({ ...valid, salience: 5 })?.salience).toBe(5);
});

test('validate turns an invalid people array into an empty array (R7)', () => {
  expect(validate({ ...valid, people: 'Maria' })?.people).toEqual([]);
  expect(validate({ ...valid, people: ['Maria', 3] })?.people).toEqual([]);
  expect(validate({ ...valid, people: ['Maria', 'Sofia'] })?.people).toEqual(['Maria', 'Sofia']);
});

test('validate turns an invalid or empty eventDate into undefined', () => {
  expect(validate({ ...valid, eventDate: '' })?.eventDate).toBeUndefined();
  expect(validate({ ...valid, eventDate: 'not a date' })?.eventDate).toBeUndefined();
  expect(validate({ ...valid, eventDate: '2026-09-01' })?.eventDate).toBe('2026-09-01');
});

test('validate cuts a title over 100 characters (R7)', () => {
  const long = 'a'.repeat(150);
  expect(validate({ ...valid, title: long })?.title).toBe('a'.repeat(100));
});

test('validate rejects a family_moment or a sensitive verdict with an empty title, but keeps logistics and small_talk', () => {
  expect(validate({ ...valid, verdict: 'family_moment', title: '' })).toBeUndefined();
  expect(validate({ ...valid, verdict: 'sensitive', title: '' })).toBeUndefined();
  expect(validate({ ...valid, verdict: 'logistics', title: '' })?.verdict).toBe('logistics');
  expect(validate({ ...valid, verdict: 'small_talk', title: '' })?.verdict).toBe('small_talk');
});

test('validate keeps a trimmed transcript', () => {
  expect(validate({ ...valid, transcript: '  hello  ' })?.transcript).toBe('hello');
  expect(validate({ ...valid, transcript: 3 })?.transcript).toBe('');
});

test('classify downloads the photo and the voice note, and calls ask once with the typed text and the sender name', async () => {
  const transport = new FakeTransport();
  transport.files.set('photo-1', { data: Buffer.from('photo'), mimeType: 'image/jpeg' });
  transport.files.set('voice-1', { data: Buffer.from('voice'), mimeType: 'audio/ogg' });
  (ask as Mock).mockResolvedValue(valid);

  const events = [event({ text: 'Maria on her first day', photo: { id: 'photo-1' } }), event({ messageId: '2', voice: { id: 'voice-1' } })];
  const result = await classify(bundle(events), transport);

  expect(ask).toHaveBeenCalledTimes(1);
  const [prompt, , options] = (ask as Mock).mock.calls[0];
  expect(prompt).toContain('Maria on her first day');
  expect(prompt).toContain('Sofia');
  expect(options.media).toEqual([
    { data: Buffer.from('photo'), mimeType: 'image/jpeg' },
    { data: Buffer.from('voice'), mimeType: 'audio/ogg' },
  ]);
  expect(result).toEqual(valid);
});

test('classify sends the thumbnail of the first video when the bundle has no photo, and never downloads the video itself', async () => {
  const transport = new FakeTransport();
  transport.files.set('thumb-1', { data: Buffer.from('thumb'), mimeType: 'image/jpeg' });
  (ask as Mock).mockResolvedValue(valid);

  const bundleWithVideo = bundle([event({ text: 'Maria', video: { id: 'video-1' }, thumbnail: { id: 'thumb-1' } })]);
  await classify(bundleWithVideo, transport);

  const [, , options] = (ask as Mock).mock.calls[0];
  expect(options.media).toEqual([{ data: Buffer.from('thumb'), mimeType: 'image/jpeg' }]);
});

test('classify sends no image for a video without a thumbnail', async () => {
  const transport = new FakeTransport();
  (ask as Mock).mockResolvedValue(valid);

  await classify(bundle([event({ text: 'Maria', video: { id: 'video-1' } })]), transport);

  const [, , options] = (ask as Mock).mock.calls[0];
  expect(options.media).toEqual([]);
});

test('classify sends a bare photo, and the prompt says the moment may have no words, so the model titles it from the picture', async () => {
  const transport = new FakeTransport();
  transport.files.set('photo-1', { data: Buffer.from('photo'), mimeType: 'image/jpeg' });
  (ask as Mock).mockResolvedValue(valid);

  await classify(bundle([event({ photo: { id: 'photo-1' } })]), transport);

  const [prompt, , options] = (ask as Mock).mock.calls[0];
  expect(prompt).toContain('The moment may have no words. Then classify it and give it a title from the photo or the video frame.');
  expect(prompt).toContain(
    'The title names what the moment shows, never the sharer, and never starts with "Photo of" or "A photo of", for example "Mapo tofu at home".',
  );
  expect(options.media).toEqual([{ data: Buffer.from('photo'), mimeType: 'image/jpeg' }]);
});

test('validate keeps up to 5 trimmed tags, once each whatever the case, and turns a missing list into an empty one', () => {
  expect(validate({ ...valid, tags: [' Lucy ', 'dog', 'lucy', 'park', 'ball', 'summer', 'beach'] })?.tags).toEqual(['Lucy', 'dog', 'park', 'ball', 'summer']);
  expect(validate({ ...valid, tags: undefined })?.tags).toEqual([]);
});

test('classify lists the tags the family already uses, once each, so the model reuses them', async () => {
  const tagged: Family = {
    ...family,
    moments: [{ tags: ['Bella', 'cat'] }, { tags: ['bella'] }, { tags: ['The beach house'] }, {}] as Family['moments'],
  };
  (ask as Mock).mockResolvedValue(valid);

  await classify({ family: tagged, sender, events: [event({ text: 'Bella on the sofa' })] }, new FakeTransport());

  const [prompt, schema] = (ask as Mock).mock.calls[0];
  expect(prompt).toContain('Tags the family already uses: Bella; cat; The beach house');
  expect(schema.properties.tags).toEqual({ type: 'array', items: { type: 'string' } });
});

test('classify returns validate(raw)', async () => {
  const transport = new FakeTransport();
  (ask as Mock).mockResolvedValue({ ...valid, verdict: 'logistics' });

  const result = await classify(bundle([event({ text: 'pick up the car' })]), transport);
  expect(result?.verdict).toBe('logistics');
});
