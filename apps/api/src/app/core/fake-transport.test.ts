import { expect, test } from 'vitest';
import { FakeTransport } from './fake-transport';

test('FakeTransport records an album, a mention, and a big reaction', async () => {
  const transport = new FakeTransport();
  const album = [{ photo: { id: 'p1' } }, { video: { id: 'v1' } }];
  const sent = await transport.send('-100', { album, text: 'Then and now', mention: { id: '111', name: 'Sofia' } });
  expect(sent).toEqual({ messageId: 'sent-1', messageIds: ['sent-1', 'sent-1-2'], voice: undefined });
  await transport.react('-100', 'sent-1', '❤', true);
  expect(transport.sent[0].message).toMatchObject({ album, mention: { id: '111', name: 'Sofia' } });
  expect(transport.reactions).toEqual([{ chatId: '-100', messageId: 'sent-1', emoji: '❤', big: true }]);
});

test('FakeTransport rejects the albums that Telegram cannot send', async () => {
  const transport = new FakeTransport();
  await expect(transport.send('-100', { album: [{ photo: { id: 'p1' } }] })).rejects.toThrow(/2 to 10/);
  const album = [{ photo: { id: 'p1' } }, { photo: { id: 'p2' } }];
  await expect(transport.send('-100', { album, buttons: [{ label: 'Not now', data: 'not-now' }] })).rejects.toThrow(/buttons/);
});

test('FakeTransport rejects a message that sets an album and a photo', async () => {
  const transport = new FakeTransport();
  await expect(transport.send('-100', { photo: { id: 'p1' }, album: [{ photo: { id: 'p2' } }] })).rejects.toThrow(/at most one/);
});

test('FakeTransport records onlyFor and a contact, and rejects a contact next to a photo', async () => {
  const transport = new FakeTransport();
  const sent = await transport.send('-100', { text: 'Shall I send this?', onlyFor: '42', contact: { phone: '+301234', name: 'Anchor' } });
  expect(sent).toEqual({ messageId: 'sent-1', voice: undefined });
  expect(transport.sent[0].message).toMatchObject({ onlyFor: '42', contact: { phone: '+301234', name: 'Anchor' } });
  await expect(transport.send('-100', { photo: { id: 'p1' }, contact: { phone: '+301234', name: 'Anchor' } })).rejects.toThrow(/at most one/);
});

test('FakeTransport records an edit and a remove', async () => {
  const transport = new FakeTransport();
  await transport.edit('-100', 'sent-1', { text: 'Sent 💛', onlyFor: '42' });
  await transport.remove('-100', 'sent-2', '42');
  expect(transport.edits).toEqual([{ chatId: '-100', messageId: 'sent-1', change: { text: 'Sent 💛', onlyFor: '42' } }]);
  expect(transport.removed).toEqual([{ chatId: '-100', messageId: 'sent-2', onlyFor: '42' }]);
});
