import { Logger } from '@nestjs/common';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { FakeTransport } from './fake-transport';
import { openStore } from './store';
import { tell } from './tell';
import { Blocked, type Context } from './types';

function setup() {
  const transport = new FakeTransport();
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-tell-')), 'state.json'));
  const family = store.addFamily('-100', '-100');
  const member = store.joinMember(family, { id: '42', name: 'Nikos' });
  member.started = true;
  const ctx: Context = { now: () => 0, store, transport: () => transport };
  return { transport, store, family, member, ctx };
}

test('tell sends the message to the member through the family transport, and returns the send result', async () => {
  const { transport, family, member, ctx } = setup();
  const sent = await tell(family, member, { text: 'Hello' }, ctx);
  expect(sent).toEqual({ messageId: 'sent-1', voice: undefined });
  expect(transport.sent).toEqual([{ chatId: '42', messageId: 'sent-1', message: { text: 'Hello' } }]);
});

test('Blocked sets started to false, saves, and returns undefined', async () => {
  const { transport, store, family, member, ctx } = setup();
  vi.spyOn(transport, 'send').mockRejectedValue(new Blocked());
  const sent = await tell(family, member, { text: 'Hello' }, ctx);
  expect(sent).toBeUndefined();
  expect(member.started).toBe(false);
  expect(store.family('-100')?.members[0].started).toBe(false);
});

test('another error logs a warning and returns undefined, and started stays as it is', async () => {
  const { transport, family, member, ctx } = setup();
  vi.spyOn(transport, 'send').mockRejectedValue(new Error('network blip'));
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const sent = await tell(family, member, { text: 'Hello' }, ctx);
  expect(sent).toBeUndefined();
  expect(member.started).toBe(true);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('network blip'));
});
