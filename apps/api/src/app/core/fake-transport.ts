import type { Button, Media, Outgoing, Transport } from './types';

export class FakeTransport implements Transport {
  readonly sent: { chatId: string; messageId: string; message: Outgoing }[] = [];
  readonly edits: { chatId: string; messageId: string; change: { text?: string; buttons?: Button[]; onlyFor?: string } }[] = [];
  readonly removed: { chatId: string; messageId: string; onlyFor?: string }[] = [];
  readonly reactions: { chatId: string; messageId: string; emoji: string; big?: boolean }[] = [];
  readonly admins = new Set<string>();
  readonly files = new Map<string, { data: Buffer; mimeType: string }>();

  async send(chatId: string, message: Outgoing) {
    if ([message.photo, message.video, message.voice, message.album, message.contact].filter(Boolean).length > 1) {
      throw new Error('An Outgoing sets at most one of photo, video, voice, album, and contact');
    }
    if (message.album && !(message.album.length >= 2 && message.album.length <= 10)) throw new Error('An album holds 2 to 10 items');
    if (message.album && message.buttons?.length) throw new Error('An album carries no buttons');
    const messageId = `sent-${this.sent.length + 1}`;
    this.sent.push({ chatId, messageId, message });
    const voice = message.voice && ('wav' in message.voice ? { id: `voice-${messageId}`, mimeType: 'audio/ogg' } : message.voice);
    if (message.album) return { messageId, messageIds: message.album.map((_, index) => (index ? `${messageId}-${index + 1}` : messageId)), voice };
    return { messageId, voice };
  }

  async edit(chatId: string, messageId: string, change: { text?: string; buttons?: Button[]; onlyFor?: string }) {
    this.edits.push({ chatId, messageId, change });
  }

  async remove(chatId: string, messageId: string, onlyFor?: string) {
    this.removed.push({ chatId, messageId, onlyFor });
  }

  async react(chatId: string, messageId: string, emoji: string, big?: boolean) {
    this.reactions.push({ chatId, messageId, emoji, big });
  }

  async download(media: Media) {
    const file = this.files.get(media.id);
    if (!file) throw new Error(`FakeTransport has no file ${media.id}`);
    return file;
  }

  async isAdmin(_chatId: string, userId: string) {
    return this.admins.has(userId);
  }

  startLink(payload: string) {
    return `https://t.me/anchor_test_bot?start=${payload}`;
  }
}
