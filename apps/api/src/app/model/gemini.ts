import { httpFetch } from '../http';
import { wav } from '../song';
import type { Provider } from './provider';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TEXT_MODELS = [process.env.GEMINI_MODEL ?? 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
const FAST_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
const TTS_MODELS = [
  process.env.GEMINI_TTS_MODEL ?? 'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
];
const VOICE = process.env.GEMINI_VOICE ?? 'Sulafat';

type Content = { type: string; text?: string; data?: string };

// ponytail: an overloaded or rate-limited model (429 or 503) falls through to the next one, no backoff
async function interact(models: string[], body: object | ((model: string) => object), timeoutMs: number): Promise<Content[]> {
  const deadline = AbortSignal.timeout(timeoutMs);
  for (const [index, model] of models.entries()) {
    const response = await httpFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '', 'content-type': 'application/json' },
      body: JSON.stringify({ model, ...(typeof body === 'function' ? body(model) : body) }),
      signal: deadline,
    });
    if ((response.status === 429 || response.status === 503) && index < models.length - 1) continue;
    if (!response.ok) throw new Error(`Gemini ${model} ${response.status}: ${await response.text()}`);
    const interaction = (await response.json()) as { steps: { type: string; content?: Content[] }[] };
    return interaction.steps.filter((step) => step.type === 'model_output').flatMap((step) => step.content ?? []);
  }
  throw new Error('Gemini: no model left');
}

export const gemini: Provider = {
  name: 'gemini',
  voice: VOICE,
  async ask(prompt, schema, media, { fast, timeoutMs }) {
    const input = media.length
      ? [
          { type: 'text', text: prompt },
          ...media.map((item) => ({
            type: item.mimeType.startsWith('image/') ? 'image' : 'audio',
            data: item.data.toString('base64'),
            mime_type: item.mimeType,
          })),
        ]
      : prompt;
    const content = await interact(
      fast ? FAST_MODELS : TEXT_MODELS,
      { input, response_format: { type: 'text', mime_type: 'application/json', schema } },
      timeoutMs,
    );
    return content.filter((item) => item.type === 'text').map((item) => item.text).join('');
  },
  async speak(text, style) {
    const content = await interact(
      TTS_MODELS,
      (model) => ({
        input: [
          {
            type: 'user_input',
            content: [
              model.startsWith('gemini-3.8')
                ? { type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }
                : { type: 'text', text: `Say in a ${style} voice: ${text}` },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: VOICE }] },
      }),
      30000,
    );
    const audio = content.filter((item) => item.type === 'audio').at(-1);
    if (!audio?.data) throw new Error('Gemini returned no audio');
    const data = Buffer.from(audio.data, 'base64');
    return data.subarray(0, 4).toString() === 'RIFF' ? data : wav(data, 24000);
  },
};
