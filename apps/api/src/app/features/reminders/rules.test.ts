process.env.TZ = 'Europe/Athens';

import { expect, test } from 'vitest';
import type { Incoming } from '../../core/types';
import { around, nextLocal, passesGate } from './rules';

const group = (text?: string, extra: Partial<Incoming> = {}): Incoming => ({
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: '1',
  sender: { id: '1', name: 'Eleni' },
  at: 0,
  text,
  ...extra,
});

test.each([
  'Dad, remember to take your pills with you when we leave in the morning.',
  "Dad, don't forget your pills tomorrow at 8.",
  'Remind me to call the plumber',
  'Dinner tonight?',
  'The bus leaves at 17:30',
  'Pick up Maria at 5pm',
  'We meet at 8',
])('%s passes the gate', (text) => {
  expect(passesGate(group(text))).toBe(true);
});

test.each([
  ['a message with no hint', group('Maria on her first day at school')],
  ['a message to Anchor', group('Anchor, remind me what Maria wore')],
  ['a command', group('/fastforward 08:05')],
  ['a voice note with a caption', group('remember this', { voice: { id: 'v' } })],
  ['a private message', group('remember the pills', { chat: 'private', familyId: undefined })],
  ['a photo with no caption', group(undefined, { photo: { id: 'p' } })],
])('%s does not pass the gate', (_, event) => {
  expect(passesGate(event)).toBe(false);
});

const at = (day: number, hours: number, minutes = 0) => new Date(2026, 8, day, hours, minutes).getTime();

test('the next local time is later today when the time is still ahead', () => {
  expect(nextLocal(at(25, 6), '08:00')).toBe(at(25, 8));
});

test('the next local time is tomorrow when the time passed or is now', () => {
  expect(nextLocal(at(25, 12), '08:00')).toBe(at(26, 8));
  expect(nextLocal(at(25, 8), '08:00')).toBe(at(26, 8));
});

test('the four times around a suggestion', () => {
  expect(around('08:00')).toEqual(['07:00', '07:30', '08:30', '09:00']);
});

test('the four times wrap across midnight', () => {
  expect(around('00:15')).toEqual(['23:15', '23:45', '00:45', '01:15']);
  expect(around('23:45')).toEqual(['22:45', '23:15', '00:15', '00:45']);
});
