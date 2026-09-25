import { spawnSync } from 'node:child_process';

// ponytail: copies the ffmpeg pipeline of transports/voice.ts with a μ-law input; the review after the demo removes the copy
export function toOgg(mulaw: Buffer): Buffer {
  const ffmpeg = spawnSync('ffmpeg', ['-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '24k', '-f', 'ogg', 'pipe:1'], { input: mulaw });
  if (ffmpeg.error || ffmpeg.status !== 0) throw new Error(`ffmpeg failed: ${ffmpeg.error ?? ffmpeg.stderr.toString().trim().split('\n').at(-1)}`);
  return ffmpeg.stdout;
}

/** A WAV file that carries the μ-law bytes as they are (format 7), for the voice pipeline of transports/voice.ts. */
export function mulawWav(mulaw: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + mulaw.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(7, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(mulaw.length, 40);
  return Buffer.concat([header, mulaw]);
}
