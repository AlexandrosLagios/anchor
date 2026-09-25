export type Clip = { data: Buffer; mimeType: string };

/** One model provider behind the seam: `ask` returns the raw JSON text of the answer, and `speak` returns WAV. */
export type Provider = {
  name: string;
  voice: string;
  ask(prompt: string, schema: object, media: Clip[], options: { fast: boolean; timeoutMs: number }): Promise<string>;
  speak(text: string, style: string): Promise<Buffer>;
};
