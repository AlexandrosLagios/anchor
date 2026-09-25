import { BadRequestException } from '@nestjs/common';
import { expect, test, vi } from 'vitest';
import type { Moment } from './anchor.service';
import { AnchorService } from './anchor.service';
import { chatPrompt, citeIds, memoryCatalog, normalizeTurns } from './chat';
import { ChatService } from './chat.service';
import { FilesService } from './files.service';
import { ask } from './gemini';

vi.mock('./gemini', async () => {
  const actual = await vi.importActual<typeof import('./gemini')>('./gemini');
  return { ...actual, ask: vi.fn() };
});

const askMock = vi.mocked(ask);

const moment = {
  id: 'm1',
  caption: 'First day',
  sender: 'sofia',
  who: 'Maria',
  what: 'held Sofia’s hand at the school gate',
  when: 'this morning',
  question: 'Whose first day?',
  answer: 'Maria',
  hint: 'Sofia’s daughter',
  praise: 'Yes, Maria',
  reveal: 'It was Maria',
  memory: 'Maria’s first day of school',
  ack: 'Saved',
  createdAt: '2026-09-25T00:00:00.000Z',
  gapDays: 1,
  nextDue: '2026-09-26T00:00:00.000Z',
  cued: false,
  phase: 'idle',
} satisfies Moment;

test('normalizeTurns keeps a user message and rejects a trailing anchor line', () => {
  expect(normalizeTurns([{ role: 'user', text: '  What do you remember?  ' }])).toEqual([
    { role: 'user', text: 'What do you remember?' },
  ]);
  expect(() => normalizeTurns([{ role: 'anchor', text: 'Hello' }])).toThrow(BadRequestException);
  expect(() => normalizeTurns([])).toThrow(BadRequestException);
});

test('citeIds drops unknown and duplicate ids', () => {
  expect(citeIds(['m1', 'nope', 'm1', 'm2'], new Set(['m1', 'm2']))).toEqual(['m1', 'm2']);
  expect(citeIds('m1', new Set(['m1']))).toEqual([]);
});

test('chatPrompt lists memories and says when files are unavailable', () => {
  const prompt = chatPrompt(
    [{ role: 'user', text: 'Find the school photo' }],
    memoryCatalog([moment]),
    [],
    'File storage is not configured, so there are no files to retrieve.',
  );
  expect(prompt).toContain('m1');
  expect(prompt).toContain('Maria’s first day of school');
  expect(prompt).toContain('File storage is not configured');
  expect(prompt).not.toContain('Whose first day?');
});

test('reply returns only cited memories and files', async () => {
  askMock.mockResolvedValueOnce({ reply: 'Here is the school morning.', momentIds: ['m1', 'missing'], fileIds: ['f1'] });
  const anchor = {
    ensure: vi.fn(async () => ({})),
    state: vi.fn(() => ({ moments: [moment] })),
  } as unknown as AnchorService;
  const files = {
    configured: () => true,
    list: vi.fn(async () => [
      {
        id: 'f1',
        pathname: 'users/u/photo.jpg',
        url: 'https://blob.example/private',
        size: 1200,
        contentType: 'image/jpeg',
        originalName: 'school.jpg',
        createdAt: '2026-09-25T00:00:00.000Z',
      },
    ]),
  } as unknown as FilesService;

  const result = await new ChatService(anchor, files).reply('user-1', [{ role: 'user', text: 'Show the school photo' }]);

  expect(result.reply).toBe('Here is the school morning.');
  expect(result.moments.map((item) => item.id)).toEqual(['m1']);
  expect(result.files).toEqual([{ id: 'f1', name: 'school.jpg', contentType: 'image/jpeg', size: 1200 }]);
  expect(JSON.stringify(result)).not.toContain('blob.example');
});
