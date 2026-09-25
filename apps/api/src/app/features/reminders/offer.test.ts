process.env.TZ = 'Europe/Athens';

import { Logger } from '@nestjs/common';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Family, Incoming } from '../../core/types';
import { ask } from '../../model/model';
import { readOffer } from './offer';

vi.mock('../../model/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../model/model')>()),
  ask: vi.fn(),
}));

const NOW = new Date(2026, 8, 25, 12, 30).getTime(); // a Friday
const choices = { moments: false, reminders: true, shares: true, voice: false, call: false };
const family = {
  members: [
    { id: '42', name: 'Nikos', started: true, choices },
    { id: '7', name: 'Eleni', started: true, choices },
  ],
} as Family;

const PILLS = 'Dad, remember to take your pills with you when we leave in the morning.';
const message = (text: string, extra: Partial<Incoming> = {}): Incoming => ({
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: '9',
  sender: { id: '7', name: 'Eleni' },
  at: NOW,
  text,
  ...extra,
});
const pills = message(PILLS, { replyTo: '5', replyToSender: { id: '42', name: 'Nikos' } });
const answer = (value: unknown) => vi.mocked(ask).mockResolvedValue(value);

beforeEach(() => {
  vi.mocked(ask).mockReset();
});

test('the pills sentence, as a reply to Nikos, offers Nikos a reminder at 08:00', async () => {
  answer({ offer: true, who: '42', time: '08:00' });
  expect(await readOffer(pills, family, NOW)).toEqual({ to: '42', time: '08:00' });
  const [prompt, schema, options] = vi.mocked(ask).mock.calls[0];
  expect(prompt).toContain('The sender is Eleni (id 7).');
  expect(prompt).toContain('Friday 12:30');
  expect(prompt).toContain('The message replies to a message from Nikos (id 42)');
  expect(prompt).toContain('- id 42: Nikos\n- id 7: Eleni');
  expect(prompt).toContain(`The message: "${PILLS}"`);
  expect(prompt).toContain('"In the morning" means 08:00 and "tonight" means 20:00');
  expect(schema).toEqual({
    type: 'object',
    properties: { offer: { type: 'boolean' }, who: { type: 'string', enum: ['42', '7', 'unknown'] }, time: { type: 'string' } },
    required: ['offer', 'who', 'time'],
  });
  expect(options).toEqual({ fast: true });
});

test('a message that replies to someone who is not a member names nobody', async () => {
  answer({ offer: false, who: 'unknown', time: '' });
  await readOffer(message(PILLS, { replyTo: '5', replyToSender: { id: '999', name: 'Anchor' } }), family, NOW);
  expect(vi.mocked(ask).mock.calls[0][0]).not.toContain('replies to');
});

test.each([
  ['a plan for the whole family', "Let's all have dinner at grandma's tomorrow at 8"],
  ['a past event', 'Remember when we took the train to Volos in the morning?'],
  ['a joke', "Don't forget to breathe tonight 😂"],
])('%s gets no offer when the call says no', async (_, text) => {
  answer({ offer: false, who: 'unknown', time: '' });
  expect(await readOffer(message(text), family, NOW)).toBeUndefined();
});

test('offer is false unless the call returns true', async () => {
  answer({ offer: 'yes', who: '42', time: '08:00' });
  expect(await readOffer(pills, family, NOW)).toBeUndefined();
});

test('a sender who must remember comes back as the sender id', async () => {
  answer({ offer: true, who: '7', time: '08:00' });
  const event = message('Remember to take my pills with me when we leave in the morning');
  expect(await readOffer(event, family, NOW)).toEqual({ to: '7', time: '08:00' });
});

test.each([
  ['unknown, for a mention of someone who is not a member', 'unknown'],
  ['an id of nobody in the family', '99'],
  ['no who at all', undefined],
])('%s makes no offer', async (_, who) => {
  answer({ offer: true, who, time: '' });
  expect(await readOffer(message('@odisseasmk , remember to receive your prize tomorrow'), family, NOW)).toBeUndefined();
});

test('the prompt asks for the sender id, unknown for a person not in the list, and no offer for a later day', async () => {
  answer({ offer: false, who: 'unknown', time: '' });
  await readOffer(pills, family, NOW);
  const [prompt] = vi.mocked(ask).mock.calls[0];
  expect(prompt).toContain('When the sender must remember, who is the id of the sender.');
  expect(prompt).toContain('When the person who must remember is not in the list, who is "unknown".');
  expect(prompt).toContain('A message that names a day after tomorrow, such as a weekday, a date, or "next week", gets offer false.');
});

test('"tomorrow at 8" offers 08:00', async () => {
  answer({ offer: true, who: '42', time: '08:00' });
  const event = message("Dad, don't forget your pills tomorrow at 8.", { replyTo: '5', replyToSender: { id: '42', name: 'Nikos' } });
  expect(await readOffer(event, family, NOW)).toEqual({ to: '42', time: '08:00' });
});

test('"on Sunday" gets no offer when the call says no', async () => {
  answer({ offer: false, who: 'unknown', time: '' });
  expect(await readOffer(message('@odisseasmk , remember to receive your prize on Sunday'), family, NOW)).toBeUndefined();
});

test.each(['8:00', '8am', '24:00', '12:60', 8, undefined])('the invalid time %s counts as an empty string', async (time) => {
  answer({ offer: true, who: '42', time });
  expect(await readOffer(pills, family, NOW)).toEqual({ to: '42', time: '' });
});

test('a failed call logs and makes no offer', async () => {
  vi.mocked(ask).mockRejectedValue(new Error('timeout'));
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  expect(await readOffer(pills, family, NOW)).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  warn.mockRestore();
});
