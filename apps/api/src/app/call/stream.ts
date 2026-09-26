// Accepts the Twilio Media Stream of a call that Anchor placed, and runs the bridge to OpenAI Realtime until the call ends.
import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { bridge, type BridgeOptions, type CallRecord, type RealtimeEvent, type TwilioEvent } from './bridge';
import { transfer } from './dial';

export const STREAM_PATH = '/call/stream';
const MAX_CALL_MS = 10 * 60_000;
const START_TIMEOUT_MS = 10_000;

export type Script = Pick<BridgeOptions, 'instructions' | 'opener' | 'askShare' | 'goodbye'> & { connectTo?: string };
interface Expected {
  script: Script;
  end: (record: CallRecord) => void;
}

const log = new Logger('Call');
const expected = new Map<string, Expected>();

/** Issues the one-time token of a call. `ended` settles with the record when the call ends; `forget` drops a call that nobody answered. */
export function expectCall(script: Script) {
  const token = randomBytes(16).toString('hex');
  const ended = new Promise<CallRecord>((end) => expected.set(token, { script, end }));
  return { token, ended, forget: () => void expected.delete(token) };
}

function openRealtime() {
  // gpt-realtime-2.1-mini paraphrased the fixed lines and skipped the goodbye on a test call, so the default is the full model
  const model = process.env.ANCHOR_REALTIME_MODEL || 'gpt-realtime-2.1';
  return new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
}

function parse<T>(data: RawData): T | undefined {
  try {
    return JSON.parse(data.toString()) as T;
  } catch {
    return undefined;
  }
}

export function attachCallStream(server: Server, connect = openRealtime) {
  const streams = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(request.url ?? '/', 'http://anchor').pathname !== STREAM_PATH) return socket.destroy();
    streams.handleUpgrade(request, socket, head, (twilio) => accept(twilio, connect));
  });
}

function accept(twilio: WebSocket, connect: () => WebSocket) {
  const waiting = setTimeout(() => twilio.close(), START_TIMEOUT_MS);
  twilio.once('close', () => clearTimeout(waiting));
  const onMessage = (data: RawData) => {
    const event = parse<TwilioEvent>(data);
    if (event?.event !== 'start') return;
    clearTimeout(waiting);
    twilio.off('message', onMessage);
    const token = event.start?.customParameters?.token ?? '';
    const call = expected.get(token);
    if (!call) {
      log.warn('Refused a call stream with an unknown token');
      return twilio.close();
    }
    expected.delete(token);
    run(twilio, event, call, connect());
  };
  twilio.on('message', onMessage);
}

function run(twilio: WebSocket, start: TwilioEvent, { script: { connectTo, ...script }, end }: Expected, realtime: WebSocket) {
  const call = bridge({
    ...script,
    toTwilio: (event) => twilio.readyState === WebSocket.OPEN && twilio.send(JSON.stringify(event)),
    toRealtime: (event) => realtime.readyState === WebSocket.OPEN && realtime.send(JSON.stringify(event)),
    hangUp: () => {
      const { callSid, connect } = call.record;
      if (!connect || !connectTo || !callSid) return twilio.close();
      // set before the request, because Twilio closes the stream as soon as the new TwiML runs
      call.record.dialed = true;
      transfer(callSid, connectTo).catch((error) => {
        call.record.dialed = false;
        log.warn(`Moving call ${callSid} to the sharer failed: ${error}`);
        twilio.close();
      });
    },
  });
  const limit = setTimeout(() => twilio.close(), MAX_CALL_MS);
  const startedAt = Date.now();
  call.twilio(start);

  realtime.on('open', () => call.open());
  realtime.on('message', (data) => {
    const event = parse<RealtimeEvent & { error?: unknown }>(data);
    if (!event) return;
    if (event.type === 'error') log.warn(`Realtime error: ${JSON.stringify(event.error)}`);
    call.realtime(event);
  });
  realtime.on('error', (error) => log.warn(`Realtime socket: ${error.message}`));
  realtime.on('close', () => twilio.close());

  twilio.on('message', (data) => {
    const event = parse<TwilioEvent>(data);
    if (event) call.twilio(event);
  });
  twilio.on('close', () => {
    clearTimeout(limit);
    realtime.close();
    const { callSid, latencies, share, tellSender, dialed } = call.record;
    log.log(
      `Call ${callSid} ended after ${Math.round((Date.now() - startedAt) / 1000)} s; latencies ${latencies.join(', ') || 'none'} ms; share ${share ?? 'not asked'}; tell the sender ${tellSender ?? false}; moved to the sharer ${dialed ?? false}`,
    );
    end(call.record);
  });
}
