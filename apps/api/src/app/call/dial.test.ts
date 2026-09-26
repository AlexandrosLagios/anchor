import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { answered, connected, ring, transfer } from './dial';

const reply = (body: object, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => {
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC1');
  vi.stubEnv('TWILIO_API_KEY_SID', 'SK1');
  vi.stubEnv('TWILIO_API_KEY_SECRET', 'secret');
  vi.stubEnv('TWILIO_FROM', '+19785550100');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('ring places the call with a stream that carries the one-time token', async () => {
  const fetch = vi.fn(async () => reply({ sid: 'CA1' }, 201));
  vi.stubGlobal('fetch', fetch);
  expect(await ring('+306900000000', 'wss://anchor.example/call/stream', 'tok"1')).toBe('CA1');
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Calls.json');
  expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('SK1:secret').toString('base64')}`);
  const form = init.body as URLSearchParams;
  expect(form.get('To')).toBe('+306900000000');
  expect(form.get('From')).toBe('+19785550100');
  expect(form.get('Twiml')).toBe(
    '<Response><Connect><Stream url="wss://anchor.example/call/stream"><Parameter name="token" value="tok&quot;1"/></Stream></Connect></Response>',
  );
});

test('ring throws when Twilio refuses the call', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ code: 21215, message: 'Geo permission' }, 400)));
  await expect(ring('+306900000000', 'wss://x/call/stream', 't')).rejects.toThrow(/Twilio 400/);
});

test('answered waits while the phone rings and is true once the member picks up', async () => {
  const statuses = ['queued', 'ringing', 'in-progress'];
  vi.stubGlobal('fetch', vi.fn(async () => reply({ status: statuses.shift() })));
  expect(await answered('CA1', async () => undefined)).toBe(true);
  expect(statuses).toEqual([]);
});

test.each(['no-answer', 'busy', 'failed', 'canceled'])('answered is false when the call ends as %s', async (status) => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ status })));
  expect(await answered('CA1', async () => undefined)).toBe(false);
});

test('transfer moves the live call to the number, which rings for 20 seconds from TWILIO_FROM', async () => {
  const fetch = vi.fn(async () => reply({ sid: 'CA1', status: 'in-progress' }));
  vi.stubGlobal('fetch', fetch);
  await transfer('CA1', '+306911111111');
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Calls/CA1.json');
  expect(init.method).toBe('POST');
  expect((init.body as URLSearchParams).get('Twiml')).toBe('<Response><Dial timeout="20" callerId="+19785550100">+306911111111</Dial></Response>');
});

test('transfer throws when Twilio refuses the update', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ code: 21220, message: 'Call is not in-progress' }, 400)));
  await expect(transfer('CA1', '+306911111111')).rejects.toThrow(/Twilio 400/);
});

test('connected waits for the dialled phone and is true once it picks up', async () => {
  const children = [[], [{ status: 'ringing' }], [{ status: 'in-progress' }]];
  const fetch = vi.fn(async () => reply({ calls: children.shift() }));
  vi.stubGlobal('fetch', fetch);
  expect(await connected('CA1', async () => undefined)).toBe(true);
  expect(children).toEqual([]);
  expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1/Calls.json?ParentCallSid=CA1');
});

test.each(['no-answer', 'busy', 'failed'])('connected is false when the dialled phone ends as %s', async (status) => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ calls: [{ status }] })));
  expect(await connected('CA1', async () => undefined)).toBe(false);
});
