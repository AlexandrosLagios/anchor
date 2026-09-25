process.env.TZ = 'Europe/Athens';

import { expect, test } from 'vitest';
import type { Incoming } from '../../core/types';
import { BUNDLE_GAP_MS, isClosed, passesRules, typedText, wordCount, worthClassifying } from './filter';
import type { Bundle } from './filter';

test('wordCount counts the words of a text and skips links', () => {
  expect(wordCount(undefined)).toBe(0);
  expect(wordCount('  ')).toBe(0);
  expect(wordCount('Maria on her first day')).toBe(5);
  expect(wordCount('https://example.com www.example.org http://a.b/c')).toBe(0);
  expect(wordCount('look https://example.com at this')).toBe(3);
});

const sender = { id: '1', name: 'Sofia' };

function event(overrides: Partial<Incoming> = {}): Incoming {
  return { chat: 'group', chatId: '-100', messageId: '1', sender, at: 0, ...overrides };
}

function bundle(events: Incoming[]): Bundle {
  return { familyId: '-100', sender, events };
}

test('passesRules drops an unsupported message, a forwarded message, a command, and a bare link', () => {
  expect(passesRules(event({ unsupported: true }))).toBe(false);
  expect(passesRules(event({ text: 'look at this', forwarded: true }))).toBe(false);
  expect(passesRules(event({ text: '/memory' }))).toBe(false);
  expect(passesRules(event({ text: 'https://example.com' }))).toBe(false);
});

test('passesRules keeps a photo with no caption, a video, and a plain text', () => {
  expect(passesRules(event({ photo: { id: 'p1' } }))).toBe(true);
  expect(passesRules(event({ video: { id: 'v1' } }))).toBe(true);
  expect(passesRules(event({ text: 'Maria on her first day' }))).toBe(true);
});

test('isClosed is true 2 minutes after the last message, and not a second before', () => {
  const open = bundle([event({ text: 'hello' })]);
  expect(isClosed(open, BUNDLE_GAP_MS - 1000)).toBe(false);
  expect(isClosed(open, BUNDLE_GAP_MS)).toBe(true);
});

test('isClosed is true at once for a captioned photo, and for a captioned video', () => {
  expect(isClosed(bundle([event({ text: 'Maria', photo: { id: 'p1' } })]), 0)).toBe(true);
  expect(isClosed(bundle([event({ text: 'Maria', video: { id: 'v1' } })]), 0)).toBe(true);
});

test('worthClassifying drops fewer than 3 typed words, and a bare photo or a bare video', () => {
  expect(worthClassifying(bundle([event({ text: 'ok great' })]))).toBe(false);
  expect(worthClassifying(bundle([event({ photo: { id: 'p1' } })]))).toBe(false);
  expect(worthClassifying(bundle([event({ video: { id: 'v1' } })]))).toBe(false);
});

test('worthClassifying keeps 3 typed words, a voice note alone, and a photo with a caption', () => {
  expect(worthClassifying(bundle([event({ text: 'a b c' })]))).toBe(true);
  expect(worthClassifying(bundle([event({ voice: { id: 'v1' } })]))).toBe(true);
  expect(worthClassifying(bundle([event({ text: 'Maria', photo: { id: 'p1' } })]))).toBe(true);
});

test('worthClassifying keeps a bare photo or a bare video that also carries a voice note', () => {
  expect(worthClassifying(bundle([event({ photo: { id: 'p1' } }), event({ messageId: '2', voice: { id: 'v1' } })]))).toBe(true);
  expect(worthClassifying(bundle([event({ video: { id: 'v1' } }), event({ messageId: '2', voice: { id: 'v2' } })]))).toBe(true);
});

test('typedText joins the texts and the captions of the bundle in message order', () => {
  const events = [event({ messageId: '1', text: 'Maria on her first day' }), event({ messageId: '2', text: 'so proud of her' })];
  expect(typedText(bundle(events))).toBe('Maria on her first day\nso proud of her');
});
