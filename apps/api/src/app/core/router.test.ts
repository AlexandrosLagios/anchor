import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { FakeTransport } from './fake-transport';
import { lines } from './lines';
import { createRouter } from './router';
import { openStore } from './store';
import type { Context, Family, Feature, Incoming, Window } from './types';

function setup(features: Feature[]) {
  const transport = new FakeTransport();
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-router-')), 'state.json'));
  const ctx: Context = { now: () => 0, store, transport: () => transport };
  return { transport, store, router: createRouter(features, ctx) };
}

const groupMessage: Incoming = {
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: '5',
  sender: { id: '1', name: 'Sofia' },
  at: 0,
  text: 'Maria on her first day at school',
};

const privateMessage = (senderId: string): Incoming => ({
  chat: 'private',
  chatId: senderId,
  messageId: '9',
  sender: { id: senderId, name: 'Nikos' },
  at: 0,
  text: 'hello',
});

const handler = (name: string, calls: string[], handled: boolean): Feature => ({
  name,
  async handle() {
    calls.push(name);
    return handled;
  },
});

test('route offers the event in feature order and stops at the first feature that handles it', async () => {
  const calls: string[] = [];
  const { router } = setup([handler('first', calls, false), handler('second', calls, true), handler('third', calls, true)]);
  await router.route(groupMessage);
  expect(calls).toEqual(['first', 'second']);
});

test('route finds the family by familyId in a group and by storyteller in private', async () => {
  const seen: (string | undefined)[] = [];
  const { router, store } = setup([
    {
      name: 'spy',
      async handle(_event: Incoming, family: Family | undefined) {
        seen.push(family?.id);
        return true;
      },
    },
  ]);
  store.addFamily('-100', '-100').storytellers.push({ id: '42', name: 'Nikos', started: true });
  await router.route(groupMessage);
  await router.route(privateMessage('42'));
  await router.route(privateMessage('7'));
  expect(seen).toEqual(['-100', '-100', undefined]);
});

test('an unhandled private message gets noInvitation from a joined storyteller, notJoined from one who has not started or stopped, and pointer from anyone else', async () => {
  const { router, store, transport } = setup([]);
  store.addFamily('-100', '-100').storytellers.push({ id: '42', name: 'Nikos', started: true }, { id: '43', name: 'Eleni', started: false });
  await router.route(privateMessage('42'));
  await router.route(privateMessage('43'));
  await router.route(privateMessage('7'));
  expect(transport.sent.map(({ chatId, message }) => [chatId, message.text])).toEqual([
    ['42', lines.noInvitation],
    ['43', lines.notJoined],
    ['7', lines.pointer],
  ]);
});

test('an unhandled group message gets no reply', async () => {
  const { router, transport } = setup([]);
  await router.route(groupMessage);
  expect(transport.sent).toEqual([]);
});

test('tick runs every feature for every family, and a failing feature stops only itself', async () => {
  const ticks: string[] = [];
  const window: Window = { from: 1, to: 2 };
  const { router, store } = setup([
    {
      name: 'broken',
      async tick() {
        throw new Error('broken tick');
      },
    },
    {
      name: 'counter',
      async tick(family: Family, got: Window) {
        ticks.push(`${family.id}:${got.from}-${got.to}`);
      },
    },
  ]);
  store.addFamily('-100', '-100');
  store.addFamily('-200', '-200');
  await router.tick(window);
  expect(ticks).toEqual(['-100:1-2', '-200:1-2']);
});
