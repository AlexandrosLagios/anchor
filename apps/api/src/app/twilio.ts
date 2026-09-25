import { createHmac, timingSafeEqual } from 'node:crypto';
import { httpFetch } from './http';

const WHATSAPP_SANDBOX = 'whatsapp:+14155238886';

function authorization() {
  const user = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_ACCOUNT_SID;
  const password = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN;
  const credentials = `${user}:${password}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function post(resource: string, form: [string, string][]) {
  const response = await httpFetch(
    `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/${resource}.json`,
    {
      method: 'POST',
      headers: { authorization: authorization() },
      body: new URLSearchParams(form),
    },
  );
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
  return (await response.json()) as { sid: string };
}

export function sendWhatsApp(to: string, body: string, mediaUrl?: string) {
  const form: [string, string][] = [
    ['From', WHATSAPP_SANDBOX],
    ['To', to],
    ['Body', body],
  ];
  if (mediaUrl) form.push(['MediaUrl', mediaUrl]);
  return post('Messages', form);
}

export async function download(mediaUrl: string): Promise<Buffer> {
  const response = await httpFetch(mediaUrl, { headers: { authorization: authorization() } });
  if (!response.ok) throw new Error(`Twilio media ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** When TWILIO_AUTH_TOKEN is set, require a valid X-Twilio-Signature. Local dev without the token stays open. */
export function validTwilioRequest(url: string, params: Record<string, string>, signature?: string): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) return true;
  if (!signature || !url) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac('sha1', token).update(payload).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const twiml = (...verbs: string[]) => `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.join('')}</Response>`;
export const message = (text: string) => `<Message>${escape(text)}</Message>`;
