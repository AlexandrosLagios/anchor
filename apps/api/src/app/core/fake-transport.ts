import type { Media, Outgoing, Transport } from './types';

export class FakeTransport implements Transport {
  readonly sent: { chatId: string; messageId: string; message: Outgoing }[] = [];
  readonly reactions: { chatId: string; messageId: string; emoji: string }[] = [];
  readonly admins = new Set<string>();
  readonly files = new Map<string, { data: Buffer; mimeType: string }>();

  async send(chatId: string, message: Outgoing) {
    const messageId = `sent-${this.sent.length + 1}`;
    this.sent.push({ chatId, messageId, message });
    const voice = message.voice && ('wav' in message.voice ? { id: `voice-${messageId}`, mimeType: 'audio/ogg' } : message.voice);
    return { messageId, voice };
  }

  async react(chatId: string, messageId: string, emoji: string) {
    this.reactions.push({ chatId, messageId, emoji });
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
