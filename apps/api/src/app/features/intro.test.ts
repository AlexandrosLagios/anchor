import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { createRouter } from '../core/router';
import { openStore } from '../core/store';
import type { Incoming } from '../core/types';
import { intro } from './intro';

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'anchor-intro-')), 'state.json');
  const transport = new FakeTransport();
  const store = openStore(file);
  const router = createRouter([intro], { now: () => 0, store, transport: () => transport });
  return { file, transport, store, router };
}

const joined: Incoming = {
  familyId: '-100',
  chat: 'group',
  chatId: '-100',
  messageId: '',
  sender: { id: '1', name: 'Sofia' },
  at: 0,
  joined: true,
};

test('joining a group saves a new family and posts intro in the group', async () => {
  const { file, transport, router } = setup();
  await router.route(joined);
  expect(openStore(file).family('-100')).toEqual({ id: '-100', chatId: '-100', storytellers: [], moments: [], counters: {} });
  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.intro } }]);
});

test('joining the same group again posts intro again and keeps one family', async () => {
  const { transport, store, router } = setup();
  await router.route(joined);
  await router.route(joined);
  expect(store.state.families).toHaveLength(1);
  expect(transport.sent.map(({ message }) => message.text)).toEqual([lines.intro, lines.intro]);
});

test('intro leaves every other event to the next feature', async () => {
  const { store, transport } = setup();
  const handled = await intro.handle?.({ ...joined, joined: undefined, text: 'hello' }, undefined, {
    now: () => 0,
    store,
    transport: () => transport,
  });
  expect(handled).toBe(false);
  expect(store.state.families).toEqual([]);
});
