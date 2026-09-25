import { Logger } from '@nestjs/common';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, type Mock, test, vi } from 'vitest';
import type { CallRecord } from '../call/bridge';
import { answered, ring } from '../call/dial';
import { expectCall, type Script } from '../call/stream';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { openStore } from '../core/store';
import { dayIndex } from '../core/clock';
import type { Context, Family, Member, Moment, Reminder } from '../core/types';
import { callMember, calls } from './calls';

vi.mock('../call/dial', () => ({ ring: vi.fn(), answered: vi.fn() }));
vi.mock('../call/stream', async (importOriginal) => ({ ...(await importOriginal<typeof import('../call/stream')>()), expectCall: vi.fn() }));

const NOW = new Date(2026, 8, 26, 11).getTime();

let transport: FakeTransport;
let ctx: Context;
let family: Family;
let nikos: Member;
let forget: Mock<() => void>;
let endCall: (record: CallRecord) => void;

const record = (overrides: Partial<CallRecord>): CallRecord => ({ audio: [], speech: [], transcript: [], latencies: [], usage: [], ...overrides });

const moment = (overrides: Partial<Moment>): Moment => ({
  id: 'm1',
  by: { id: '1', name: 'Eleni' },
  messageIds: ['57'],
  savedAt: NOW - 3_600_000,
  text: "Maria's first day of school! 🎒",
  salience: 3,
  sensitive: false,
  people: ['Maria'],
  title: "Maria's first day of school",
  stories: [],
  lookbacks: [],
  memoryPostIds: [],
  returns: {},
  ...overrides,
});

const script = () => vi.mocked(expectCall).mock.calls[0][0] as Script;
const texts = () => transport.sent.map(({ chatId, message }) => [chatId, message.text]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.stubEnv('TWILIO_FROM', '+19785550100');
  vi.stubEnv('ANCHOR_PUBLIC_URL', 'https://anchor.example/');
  forget = vi.fn<() => void>();
  vi.mocked(expectCall).mockImplementation(() => ({ token: 'tok', ended: new Promise<CallRecord>((end) => (endCall = end)), forget }));
  vi.mocked(ring).mockResolvedValue('CA1');
  vi.mocked(answered).mockResolvedValue(true);
  transport = new FakeTransport();
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-')), 'state.json'), NOW);
  ctx = { now: () => NOW, store, transport: () => transport };
  family = store.addFamily('-100', '-100');
  nikos = store.joinMember(family, { id: '7', name: 'Nikos' });
  nikos.started = true;
  nikos.phone = '+306900000000';
  family.moments.push(
    moment({ id: 'old', savedAt: NOW - 86_400_000, text: 'An older moment' }),
    moment({ id: 'm1' }),
    moment({ id: 'own', by: { id: '7', name: 'Nikos' }, savedAt: NOW - 60_000, text: 'My own moment' }),
    moment({ id: 'sad', savedAt: NOW - 30_000, text: 'A sad moment', sensitive: true }),
  );
});

afterEach(() => vi.unstubAllEnvs());

test('callMember rings the member about the newest moment that someone else shared', async () => {
  expect(await callMember(family, nikos, ctx)).toBe(true);
  expect(ring).toHaveBeenCalledWith('+306900000000', 'wss://anchor.example/call/stream', 'tok');
  expect(script().opener).toBe(
    "Hello Nikos, this is Anchor, the family's record keeper. I'm not a person. Eleni shared: «Maria's first day of school!» What does it remind you of?",
  );
  expect(script().askShare).toBe(lines.call.askShare);
  expect(script().goodbye).toBe('Thank you, Nikos. Goodbye');
  expect(script().instructions).toContain(lines.call.reachPerson('Eleni'));
  expect(texts()).toEqual([['7', "I'm ringing you now 📞"]]);
});

test.each([
  ['the member has no phone', () => (nikos.phone = undefined)],
  ['TWILIO_FROM is unset', () => vi.stubEnv('TWILIO_FROM', '')],
  ['ANCHOR_PUBLIC_URL is unset', () => vi.stubEnv('ANCHOR_PUBLIC_URL', '')],
  ['no moment of someone else is there', () => (family.moments = family.moments.filter((m) => m.by.id === '7'))],
])('callMember returns false and rings nobody when %s', async (_, arrange) => {
  arrange();
  expect(await callMember(family, nikos, ctx)).toBe(false);
  expect(ring).not.toHaveBeenCalled();
  expect(transport.sent).toEqual([]);
});

test('callMember returns false and drops the token when Twilio refuses the call', async () => {
  vi.mocked(ring).mockRejectedValue(new Error('Twilio 400: Geo permission'));
  expect(await callMember(family, nikos, ctx)).toBe(false);
  expect(forget).toHaveBeenCalled();
  expect(transport.sent).toEqual([]);
});

test('an unanswered call drops the token and posts nothing', async () => {
  vi.mocked(answered).mockResolvedValue(false);
  await callMember(family, nikos, ctx);
  await expect.poll(() => forget.mock.calls.length).toBe(1);
  expect(texts()).toEqual([['7', "I'm ringing you now 📞"]]);
});

test('a yes to the words posts the story in the group without a voice note', async () => {
  await callMember(family, nikos, ctx);
  await expect.poll(() => endCall).toBeDefined();
  endCall(record({ share: 'words', transcript: [{ speaker: 'person', text: 'Kostas held his dad’s hand.' }] }));
  await expect.poll(() => family.moments[1].stories.length).toBe(1);
  expect(family.moments[1].stories[0]).toMatchObject({ by: { id: '7', name: 'Nikos' }, text: 'Kostas held his dad’s hand.', voice: undefined });
  expect(texts()).toContainEqual(['-100', lines.storyAdded('Nikos', 'Eleni', 'Kostas held his dad’s hand.')]);
});

test('a no keeps nothing from the call', async () => {
  await callMember(family, nikos, ctx);
  await expect.poll(() => endCall).toBeDefined();
  endCall(record({ share: 'no', tellSender: false, transcript: [{ speaker: 'person', text: 'A private thought.' }] }));
  await new Promise((done) => setTimeout(done, 10));
  expect(family.moments[1].stories).toEqual([]);
  expect(texts()).toEqual([['7', "I'm ringing you now 📞"]]);
});

test('a yes to telling the sender asks the sender in the group for a call', async () => {
  await callMember(family, nikos, ctx);
  await expect.poll(() => endCall).toBeDefined();
  endCall(record({ share: 'no', tellSender: true }));
  await expect.poll(() => transport.sent.length).toBe(2);
  expect(transport.sent[1]).toMatchObject({ chatId: '-100', message: { text: lines.wouldLoveCall('Nikos', 'Eleni'), mention: { id: '1', name: 'Eleni' } } });
});

const reminder = (overrides: Partial<Reminder>): Reminder => ({
  id: 'r1',
  to: '7',
  from: { id: '1', name: 'Eleni' },
  text: 'Take your pills with you when we leave 💊',
  sourceId: '90',
  time: '08:00',
  status: 'sent',
  sentAt: NOW,
  ...overrides,
});

const tick = (from: number, to: number) => calls.tick?.(family, { from, to }, ctx);

test('a reminder call reads the reminder in the sender’s words and shares nothing', async () => {
  expect(await callMember(family, nikos, ctx, reminder({}))).toBe(true);
  expect(script().opener).toBe(
    "Hello Nikos, this is Anchor, the family's record keeper. I'm not a person. Your reminder. Eleni wrote: «Take your pills with you when we leave»",
  );
  expect(script().askShare).toBeUndefined();
  await expect.poll(() => endCall).toBeDefined();
  endCall(record({ share: 'words', tellSender: true, transcript: [{ speaker: 'person', text: 'Thanks.' }] }));
  await new Promise((done) => setTimeout(done, 10));
  expect(texts()).toEqual([['7', "I'm ringing you now 📞"]]);
});

test('the calls tick rings a member who chose calls for a reminder sent in the window', async () => {
  nikos.choices.call = true;
  const later = NOW + 60_000;
  family.reminders.push(reminder({ id: 'r1', sentAt: later }), reminder({ id: 'r2', sentAt: NOW }), reminder({ id: 'r3', to: '1', sentAt: later }));
  await tick(later - 2_000, later);
  expect(ring).toHaveBeenCalledTimes(1);
  expect(script().opener).toContain('Your reminder. Eleni wrote');
});

test('the calls tick rings nobody who did not choose calls', async () => {
  family.reminders.push(reminder({}));
  await tick(NOW - 2_000, NOW);
  expect(ring).not.toHaveBeenCalled();
});

test('the daily call rings once at 11:00 when the family shared a moment since the last call', async () => {
  nikos.choices.call = true;
  await tick(NOW - 2_000, NOW);
  expect(ring).toHaveBeenCalledTimes(1);
  expect(nikos.lastCallDay).toBe(dayIndex(NOW));
  await tick(NOW, NOW + 2_000);
  expect(ring).toHaveBeenCalledTimes(1);
});

test('the daily call stays silent when nothing new was shared since the last call', async () => {
  nikos.choices.call = true;
  nikos.lastCallDay = dayIndex(NOW) - 1;
  family.moments = family.moments.filter((m) => m.id === 'old');
  await tick(NOW - 2_000, NOW);
  expect(ring).not.toHaveBeenCalled();
});
