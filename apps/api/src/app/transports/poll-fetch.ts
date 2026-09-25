import { Agent, request } from 'node:https';
import type { HttpResponse } from '../http';

// A Bot API call through global fetch waits behind a pending getUpdates long poll until the poll returns: 28 s of 30, measured
// on the dev bot. The long poll gets its own connection here, and the same calls then take 0.2 s.
const agent = new Agent({ keepAlive: true, maxSockets: 1 });

export function pollFetch(url: string, init: RequestInit = {}): Promise<HttpResponse> {
  const body = typeof init.body === 'string' ? init.body : undefined;
  const headers = { ...(init.headers as Record<string, string>), ...(body ? { 'content-length': String(Buffer.byteLength(body)) } : {}) };
  return new Promise((resolve, reject) => {
    const sent = request(url, { method: init.method, headers, agent, signal: init.signal ?? undefined }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const data = Buffer.concat(chunks);
        const status = response.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => data.toString(),
          json: async () => JSON.parse(data.toString()),
          arrayBuffer: async () => new Uint8Array(data).buffer,
        });
      });
    });
    sent.on('error', reject);
    sent.end(body);
  });
}
