const RATE = 16000;

// ponytail: an original synthesized placeholder melody; the music therapist supplies the real song for the demo
const NOTES: [number, number][] = [
  [57, 1], [62, 1], [65, 1], [69, 2], [67, 1], [65, 1], [64, 1], [62, 2],
  [60, 1], [64, 1], [67, 1], [65, 1.5], [64, 0.5], [62, 3],
];

export function song(): Buffer {
  const beat = 0.42;
  const samples: number[] = [];
  for (const [midi, beats] of NOTES) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const length = Math.round(beats * beat * RATE);
    for (let i = 0; i < length; i++) {
      const t = i / RATE;
      const envelope = Math.min(1, t * 40) * Math.exp(-2.2 * t);
      const tone = Math.sin(2 * Math.PI * frequency * t) + 0.35 * Math.sin(4 * Math.PI * frequency * t) + 0.5 * Math.sin(Math.PI * frequency * t);
      samples.push(0.3 * envelope * tone);
    }
  }
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), i * 2));
  return wav(pcm, RATE);
}

export function wav(pcm: Buffer, rate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
