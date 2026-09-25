import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { lines } from './core/lines';
import { FamilyService } from './family.service';
import { httpFetch, type HttpResponse } from './http';

vi.mock('./http', () => ({ httpFetch: vi.fn() }));
const fetchMock = vi.mocked(httpFetch);

const ok = (result: unknown): HttpResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, result }),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
});

const stateFile = () => join(mkdtempSync(join(tmpdir(), 'anchor-host-')), 'state.json');
const anchorBot = { id: 999, is_bot: true, first_name: 'Anchor', username: 'anchor_test_bot' };
const sofia = { id: 111, is_bot: false, first_name: 'Sofia' };
const group = { id: -1001234567890, title: 'The Pappas family', type: 'supergroup' };
const date = 1790340000;
const updates = [
  {
    update_id: 1,
    my_chat_member: {
      chat: group,
      from: sofia,
      date,
      old_chat_member: { status: 'left', user: anchorBot },
      new_chat_member: { status: 'member', user: anchorBot },
    },
  },
  { update_id: 2, message: { message_id: 3, from: { id: 222, is_bot: false, first_name: 'Nikos' }, chat: { id: 222, type: 'private' }, date, text: 'hi' } },
];

afterEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

test('without a token the host starts no store, no tick, and no poll', () => {
  const file = stateFile();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  vi.stubEnv('ANCHOR_STATE_FILE', file);
  const host = new FamilyService();
  host.onApplicationBootstrap();
  host.onApplicationShutdown();
  expect(existsSync(file)).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('with a token the host polls Telegram, introduces Anchor to a new group, and points a stranger to the group', async () => {
  const file = stateFile();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'TOKEN');
  vi.stubEnv('ANCHOR_STATE_FILE', file);
  const sent: unknown[] = [];
  let polls = 0;
  fetchMock.mockImplementation(async (url, init) => {
    const method = url.slice(url.lastIndexOf('/') + 1);
    const params = JSON.parse(String(init?.body ?? '{}'));
    if (method === 'getMe') return ok(anchorBot);
    if (method === 'sendMessage') {
      sent.push({ chat_id: params.chat_id, text: params.text });
      return ok({ message_id: 10 + sent.length, chat: group, date });
    }
    polls += 1;
    if (polls === 1) return ok(updates);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return ok([]);
  });

  const host = new FamilyService();
  host.onApplicationBootstrap();
  await vi.waitFor(() =>
    expect(sent).toEqual([
      { chat_id: '-1001234567890', text: lines.intro },
      { chat_id: '222', text: lines.pointer },
    ]),
  );
  host.onApplicationShutdown();

  expect(JSON.parse(readFileSync(file, 'utf8')).families).toEqual([
    { id: '-1001234567890', chatId: '-1001234567890', storytellers: [], moments: [], counters: {} },
  ]);
});
