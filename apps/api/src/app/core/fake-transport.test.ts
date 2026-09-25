import { expect, test } from 'vitest';
import { FakeTransport } from './fake-transport';

test('FakeTransport records an album, a mention, and a big reaction', async () => {
  const transport = new FakeTransport();
  const album = [{ photo: { id: 'p1' } }, { video: { id: 'v1' } }];
  await transport.send('-100', { album, text: 'Then and now', mention: { id: '111', name: 'Sofia' } });
  await transport.react('-100', 'sent-1', '❤', true);
  expect(transport.sent[0].message).toMatchObject({ album, mention: { id: '111', name: 'Sofia' } });
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: 'sent-1', emoji: '❤', big: true }]);
});

test('FakeTransport rejects a message that sets an album and a photo', async () => {
  const transport = new FakeTransport();
  await expect(transport.send('-100', { photo: { id: 'p1' }, album: [{ photo: { id: 'p2' } }] })).rejects.toThrow(/at most one/);
});
