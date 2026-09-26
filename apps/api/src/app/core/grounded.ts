// the words of a model answer that must come from its sources: every number, every quote, and every name inside a sentence
const QUOTE = /[«“"]([^»”"]+)[»”"]/g;
const NUMBER = /\d+/g;
// ponytail: a name is a capitalised word after a word or a comma, so an invented name that opens a sentence passes; add a verifier call when that matters
const NAME = /(?<=[\p{L}\p{N},;:)]\s+)\p{Lu}[\p{L}\p{M}-]*/gu;
const WORD = /[\p{L}\p{M}-]+/gu;
const OWN = new Set(['I', 'Anchor']);
const EDGES = /^[\s.,;:!?-]+|[\s.,;:!?-]+$/g;

const plain = (text: string) => text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase();

/** The numbers, names, and quotes of the answer that no source holds. A quote may skip words with an ellipsis. */
export function unsupported(answer: string, sources: string[]): string[] {
  const source = sources.join('\n');
  const said = plain(source);
  const numbers = new Set((source.match(NUMBER) ?? []).map(Number));
  const words = new Set(source.match(WORD) ?? []);
  const quotes = [...answer.matchAll(QUOTE)].map((match) => match[1].trim());
  const rest = answer.replace(QUOTE, ' ');
  const quoted = (quote: string) => quote.split(/…|\.\.\./).every((part) => !plain(part).replace(EDGES, '') || said.includes(plain(part).replace(EDGES, '')));
  return [
    ...(rest.match(NUMBER) ?? []).filter((number) => !numbers.has(Number(number))),
    ...(rest.match(NAME) ?? []).filter((name) => !OWN.has(name) && !words.has(name)),
    ...quotes.filter((quote) => !quoted(quote)),
  ];
}

export const grounded = (answer: string, sources: string[]) => unsupported(answer, sources).length === 0;
