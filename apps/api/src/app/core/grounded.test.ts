import { expect, test } from 'vitest';
import { grounded, unsupported } from './grounded';

const SOURCES = [
  "Eleni shared: «Maria's first day of school! She wore her new red backpack.» (happened on 26 September 2026)",
  'Sofia: «My first day was in 1958. My mother walked me to the village school, and I cried at the gate.»',
  "Sat 26 Sep, 12:00 Eleni: Lunch at Mum's on Sunday, 13:00",
];

test('an answer whose numbers, names, and quotes all come from the sources is grounded', () => {
  expect(grounded("Maria started school on 26 September 2026. Eleni shared it, and Sofia added her own first day, in 1958.", SOURCES)).toBe(true);
  expect(grounded('Sofia remembered: «My mother walked me to the village school.»', SOURCES)).toBe(true);
  expect(grounded("Lunch is at Mum's on Sunday at 13:00.", SOURCES)).toBe(true);
  expect(grounded("I don't know that yet. Nobody has shared it in the family record.", SOURCES)).toBe(true);
});

test('a number that no source holds is unsupported', () => {
  expect(unsupported('Maria started school in 2019.', SOURCES)).toEqual(['2019']);
  expect(unsupported('Lunch is on Sunday at 14:00.', SOURCES)).toEqual(['14']);
});

test('a name inside a sentence that no source holds is unsupported, and a possessive or the first word of a sentence is fine', () => {
  expect(unsupported('Maria goes to Saint George School with Eleni.', SOURCES)).toEqual(['Saint', 'George', 'School']);
  expect(unsupported("Yes, that was Maria's first day.", SOURCES)).toEqual([]);
  expect(unsupported("Of course. I'm Anchor, and I keep the photos.", SOURCES)).toEqual([]);
});

test('a quote must be the words of a source, even split by an ellipsis', () => {
  expect(unsupported('Sofia said «I loved my school».', SOURCES)).toEqual(['I loved my school']);
  expect(unsupported('Sofia wrote “My first day was in 1958 … I cried at the gate.”', SOURCES)).toEqual([]);
});
