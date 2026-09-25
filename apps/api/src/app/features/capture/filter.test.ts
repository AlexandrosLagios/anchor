import { expect, test } from 'vitest';
import { wordCount } from './filter';

test('wordCount counts the words of a text and skips links', () => {
  expect(wordCount(undefined)).toBe(0);
  expect(wordCount('  ')).toBe(0);
  expect(wordCount('Maria on her first day')).toBe(5);
  expect(wordCount('https://example.com www.example.org http://a.b/c')).toBe(0);
  expect(wordCount('look https://example.com at this')).toBe(3);
});
