// Rings a member through the Twilio Calls API, with inline TwiML, so the configuration of the Twilio number never changes.
import { httpFetch } from '../http';

const WAITING = new Set(['queued', 'initiated', 'ringing']);
const MAX_POLLS = 120;

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

/** True once the member picks up, false when the call ends unanswered. */
export async function answered(sid: string, pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))): Promise<boolean> {
  for (let poll = 0; poll < MAX_POLLS; poll++) {
    const response = await httpFetch(`${calls()}/${sid}.json`, { headers: { authorization: authorization() } });
    if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
    const { status } = (await response.json()) as { status: string };
    if (!WAITING.has(status)) return status === 'in-progress' || status === 'completed';
    await pause(1000);
  }
  return false;
}
