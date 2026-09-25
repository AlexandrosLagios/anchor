import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { attachCallStream, expectCall } from './stream';

let server: Server;
let realtime: WebSocketServer;
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
  realtimeMessages = [];
  realtime = new WebSocketServer({ port: 0 });
  realtime.on('connection', (socket) => socket.on('message', (data) => realtimeMessages.push(JSON.parse(data.toString()))));
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
