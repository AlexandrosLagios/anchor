import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { transfer } from './dial';
import { attachCallStream, expectCall } from './stream';

vi.mock('./dial', () => ({ transfer: vi.fn() }));

let server: Server;
let realtime: WebSocketServer;
let realtimeSocket: WebSocket;
let realtimeMessages: { type: string; session?: { instructions?: string } }[];

const port = (address: unknown) => (address as AddressInfo).port;
const closed = (socket: WebSocket) => new Promise<void>((done) => socket.once('close', () => done()));
const opened = (socket: WebSocket) => new Promise<void>((done) => socket.once('open', () => done()));

function twilio(path = '/call/stream') {
  return new WebSocket(`ws://127.0.0.1:${port(server.address())}${path}`);
}

function start(socket: WebSocket, token: string) {
  socket.send(JSON.stringify({ event: 'connected' }));
  socket.send(JSON.stringify({ event: 'start', start: { streamSid: 'MZ1', callSid: 'CA1', customParameters: { token } } }));
}

beforeEach(async () => {
  vi.resetAllMocks();
  realtimeMessages = [];
  realtime = new WebSocketServer({ port: 0 });
  realtime.on('connection', (socket) => {
    realtimeSocket = socket;
    socket.on('message', (data) => realtimeMessages.push(JSON.parse(data.toString())));
  });
  await new Promise<void>((done) => realtime.once('listening', () => done()));
  server = createServer();
  attachCallStream(server, () => new WebSocket(`ws://127.0.0.1:${port(realtime.address())}`));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
});

afterEach(async () => {
  await new Promise((done) => server.close(done));
  await new Promise((done) => realtime.close(done));
});

test('a stream with a token Anchor did not issue is closed', async () => {
  const socket = twilio();
  await opened(socket);
  start(socket, 'forged');
  await closed(socket);
  expect(realtimeMessages).toEqual([]);
});

test('a stream with an issued token runs the call, and the record arrives when the call ends', async () => {
  const call = expectCall({ instructions: 'Be Anchor.', opener: 'Hello.' });
  const socket = twilio();
  await opened(socket);
  start(socket, call.token);
  await expect.poll(() => realtimeMessages.map((message) => message.type)).toEqual(['session.update', 'response.create']);
  expect(realtimeMessages[0].session?.instructions).toBe('Be Anchor.');
  socket.close();
  expect((await call.ended).callSid).toBe('CA1');
});

test('a token works for one stream only', async () => {
  const call = expectCall({ instructions: 'Be Anchor.', opener: 'Hello.' });
  const first = twilio();
  await opened(first);
  start(first, call.token);
  await expect.poll(() => realtimeMessages.length).toBe(2);
  const second = twilio();
  await opened(second);
  start(second, call.token);
  await closed(second);
  first.close();
  await call.ended;
});

test('a forgotten token is refused', async () => {
  const call = expectCall({ instructions: 'Be Anchor.', opener: 'Hello.' });
  call.forget();
  const socket = twilio();
  await opened(socket);
  start(socket, call.token);
  await closed(socket);
});

test('an upgrade on another path is refused', async () => {
  const socket = twilio('/elsewhere');
  const failed = new Promise<void>((done) => socket.once('error', () => done()));
  await failed;
});

test('a frame that is not JSON is ignored', async () => {
  const socket = twilio();
  await opened(socket);
  socket.send('not json');
  start(socket, 'forged');
  await closed(socket);
});

test('a start frame without its start object is refused, and the server keeps running', async () => {
  const socket = twilio();
  await opened(socket);
  socket.send(JSON.stringify({ event: 'start' }));
  await closed(socket);
  const next = twilio();
  await opened(next);
  next.close();
});

async function answerConnect(token: string) {
  const socket = twilio();
  await opened(socket);
  start(socket, token);
  await expect.poll(() => realtimeMessages.length).toBe(2);
  const endCall = { type: 'function_call', name: 'end_call', arguments: '{"share":"no","tell_sender":false,"connect":true}' };
  realtimeSocket.send(JSON.stringify({ type: 'response.done', response: { output: [endCall] } }));
  await new Promise((done) => setTimeout(done, 20));
  socket.send(JSON.stringify({ event: 'mark', mark: { name: 'hangup' } }));
  return socket;
}

test('a yes to connect moves the live call to the sharer, and Twilio ends the stream', async () => {
  vi.mocked(transfer).mockResolvedValue(undefined);
  const call = expectCall({ instructions: 'Be Anchor.', opener: 'Hello.', connectTo: '+306911111111' });
  const socket = await answerConnect(call.token);
  await expect.poll(() => vi.mocked(transfer).mock.calls).toEqual([['CA1', '+306911111111']]);
  expect(socket.readyState).toBe(WebSocket.OPEN);
  socket.close();
  expect(await call.ended).toMatchObject({ connect: true, dialed: true });
});

test('a refused transfer ends the call and marks it as not dialled', async () => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.mocked(transfer).mockRejectedValue(new Error('Twilio 400'));
  const call = expectCall({ instructions: 'Be Anchor.', opener: 'Hello.', connectTo: '+306911111111' });
  const socket = await answerConnect(call.token);
  await closed(socket);
  expect(await call.ended).toMatchObject({ connect: true, dialed: false });
});

test('a yes to connect without a number to dial hangs up', async () => {
  const call = expectCall({ instructions: 'Be Anchor.', opener: 'Hello.' });
  const socket = await answerConnect(call.token);
  await closed(socket);
  expect(transfer).not.toHaveBeenCalled();
  expect((await call.ended).dialed).toBeUndefined();
});
