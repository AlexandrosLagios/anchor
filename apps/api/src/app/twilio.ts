const WHATSAPP_SANDBOX = 'whatsapp:+14155238886';

function authorization() {
  const user = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_ACCOUNT_SID;
  const password = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN;
  const credentials = `${user}:${password}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function post(resource: string, form: [string, string][]) {
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/${resource}.json`, {
    method: 'POST',
    headers: { authorization: authorization() },
    body: new URLSearchParams(form),
  });
  if (!response.ok) throw new Error(`Twilio ${response.status}: ${await response.text()}`);
  return (await response.json()) as { sid: string };
}

export function callMaria(baseUrl: string) {
  return post('Calls', [
    ['To', process.env.MARIA_PHONE ?? ''],
    ['From', process.env.TWILIO_FROM ?? ''],
    ['Url', `${baseUrl}/voice/start`],
    ['StatusCallback', `${baseUrl}/voice/status`],
    ...['initiated', 'ringing', 'answered', 'completed'].map((event): [string, string] => ['StatusCallbackEvent', event]),
  ]);
}

export function sendWhatsApp(to: string, body: string) {
  return post('Messages', [
    ['From', WHATSAPP_SANDBOX],
    ['To', to],
    ['Body', body],
  ]);
}

export async function download(mediaUrl: string): Promise<Buffer> {
  const response = await fetch(mediaUrl, { headers: { authorization: authorization() } });
  if (!response.ok) throw new Error(`Twilio media ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const twiml = (...verbs: string[]) => `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.join('')}</Response>`;
export const say = (text: string) => `<Say voice="Google.el-GR-Wavenet-B" language="el-GR">${escape(text)}</Say>`;
export const play = (url: string) => `<Play>${escape(url)}</Play>`;
export const message = (text: string) => `<Message>${escape(text)}</Message>`;
export const listen = (action: string, prompt: string) =>
  `<Gather input="speech" language="el-GR" speechTimeout="auto" timeout="8" actionOnEmptyResult="true" action="${action}">${prompt}</Gather>`;
