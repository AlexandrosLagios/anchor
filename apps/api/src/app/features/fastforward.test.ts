import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { createRouter } from '../core/router';
import { openStore } from '../core/store';
import type { Context, Incoming } from '../core/types';
import { fastforward } from './fastforward';

const NOW = new Date(2026, 8, 25, 12).getTime();

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'anchor-fastforward-')), 'state.json');
  const transport = new FakeTransport();
  const store = openStore(file);
  store.addFamily('-100', '-100');
  store.save();
  const ctx: Context = { now: () => NOW + store.state.clockOffset, store, transport: () => transport };
  const router = createRouter([fastforward], ctx);
  return { file, transport, store, ctx, router };
}

function command(text: string, chat: 'group' | 'private' = 'group'): Incoming {
  return {
    familyId: chat === 'group' ? '-100' : undefined,
    chat,
    chatId: chat === 'group' ? '-100' : '1',
    messageId: 'msg-1',
    sender: { id: '1', name: 'Sofia' },
    at: NOW,
    text,
  };
}

test("an admin's /fastforward 7 jumps the clock and replies with the new time", async () => {
  const { file, transport, router } = setup();
  transport.admins.add('1');
  await router.route(command('/fastforward 7'));
  expect(openStore(file).state.clockOffset).toBe(7 * 86_400_000);
  expect(transport.sent).toEqual([
    { chatId: '-100', messageId: 'sent-1', message: { text: "⏩ It's now 2 October 2026 at 12:00 on the family clock.", replyTo: 'msg-1' } },
  ]);
});

test('a second jump adds to the first', async () => {
  const { file, transport, router } = setup();
  transport.admins.add('1');
  await router.route(command('/fastforward 7'));
  await router.route(command('/fastforward 3'));
  expect(openStore(file).state.clockOffset).toBe(10 * 86_400_000);
  expect(transport.sent.at(-1)?.message.text).toBe("⏩ It's now 5 October 2026 at 12:00 on the family clock.");
});

const invalidArguments = [
  '/fastforward',
  '/fastforward 0',
  '/fastforward 401',
  '/fastforward 1.5',
  '/fastforward -3',
  '/fastforward abc',
  '/fastforward 7 days',
];

test.each(invalidArguments)('invalid argument %s gets the usage line and no jump', async (text) => {
  const { file, transport, router } = setup();
  transport.admins.add('1');
  await router.route(command(text));
  expect(openStore(file).state.clockOffset).toBe(0);
  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.fastforwardUsage, replyTo: 'msg-1' } }]);
});

test('a member who is not an admin gets no reply, no jump, and handle returns true', async () => {
  const { store, transport, ctx } = setup();
  const handled = await fastforward.handle?.(command('/fastforward 7'), store.family('-100'), ctx);
  expect(handled).toBe(true);
  expect(transport.sent).toEqual([]);
  expect(store.state.clockOffset).toBe(0);
});

test('a group command with no family on record returns false and sends nothing', async () => {
  const { transport, ctx } = setup();
  const handled = await fastforward.handle?.(command('/fastforward 7'), undefined, ctx);
  expect(handled).toBe(false);
  expect(transport.sent).toEqual([]);
});

test.each([
  ['/fastforwarding 7', 'group'] as const,
  ['/memory', 'group'] as const,
  ['hello', 'group'] as const,
  ['/fastforward 7', 'private'] as const,
])('%s in a %s chat returns false', async (text, chat) => {
  const { store, transport, ctx } = setup();
  transport.admins.add('1');
  const handled = await fastforward.handle?.(command(text, chat), store.family('-100'), ctx);
  expect(handled).toBe(false);
  expect(transport.sent).toEqual([]);
});
