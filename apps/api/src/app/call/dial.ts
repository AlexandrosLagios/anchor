// Rings a member through the Twilio Calls API, with inline TwiML, so the configuration of the Twilio number never changes.
import { httpFetch } from '../http';

const WAITING = new Set(['queued', 'initiated', 'ringing']);
const MAX_POLLS = 120;
const CONNECT_RING_S = 20;

const calls = () => `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls`;
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ponytail: copies the Basic auth of twilio.ts, which does not export it; the review after the demo removes the copy
function authorization() {
  const user = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_ACCOUNT_SID;
  const password = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN;
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

/** Rings `to` from TWILIO_FROM. The answered call streams to `stream` with the one-time `token`. Returns the call sid. */
export async function ring(to: string, stream: string, token: string): Promise<string> {
  const twiml = `<Response><Connect><Stream url="${escape(stream)}"><Parameter name="token" value="${escape(token)}"/></Stream></Connect></Response>`;
  const response = await httpFetch(`${calls()}.json`, {
    method: 'POST',
    headers: { authorization: authorization() },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM ?? '', Twiml: twiml }),
  });
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { sid: string }).sid;
}

/** Moves the live call `sid` to `to` with new TwiML. The new TwiML ends the call stream, so Anchor leaves the call. */
export async function transfer(sid: string, to: string): Promise<void> {
  const twiml = `<Response><Dial timeout="${CONNECT_RING_S}" callerId="${escape(process.env.TWILIO_FROM ?? '')}">${escape(to)}</Dial></Response>`;
  const response = await httpFetch(`${calls()}/${sid}.json`, { method: 'POST', headers: { authorization: authorization() }, body: new URLSearchParams({ Twiml: twiml }) });
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
}

type Pause = (ms: number) => Promise<void>;
const wait: Pause = (ms) => new Promise<void>((done) => setTimeout(done, ms));

async function get<T>(url: string): Promise<T> {
  const response = await httpFetch(url, { headers: { authorization: authorization() } });
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

async function pickedUp(status: () => Promise<string | undefined>, pause: Pause): Promise<boolean> {
  for (let poll = 0; poll < MAX_POLLS; poll++) {
    const now = await status();
    if (now && !WAITING.has(now)) return now === 'in-progress' || now === 'completed';
    await pause(1000);
  }
  return false;
}

/** True once the member picks up, false when the call ends unanswered. */
export const answered = (sid: string, pause = wait) => pickedUp(async () => (await get<{ status: string }>(`${calls()}/${sid}.json`)).status, pause);

/** True once the phone that the transferred call `sid` dials picks up, false when it rings out. */
export const connected = (sid: string, pause = wait) =>
  pickedUp(async () => (await get<{ calls: { status: string }[] }>(`${calls()}.json?ParentCallSid=${sid}`)).calls[0]?.status, pause);
