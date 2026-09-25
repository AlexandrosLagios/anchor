import { expect, test } from 'vitest';
import { lines } from './lines';

test('invitation and memoryCaption clip a long quote to 600 characters that end with …', () => {
  const long = 'a'.repeat(2000);
  const clip = `«${'a'.repeat(599)}…»`;
  expect(lines.invitation('Sofia', long)).toContain(clip);
  expect(lines.memoryCaption('One week ago', 'Sofia', long)).toContain(clip);
  expect(lines.invitation('Sofia', 'b'.repeat(600))).toContain(`«${'b'.repeat(600)}»`);
});

test('storyAdded clips its quote to 600 characters', () => {
  expect(lines.storyAdded('Nikos', 'Sofia', 'a'.repeat(2000))).toContain(`«${'a'.repeat(599)}…»`);
});

test('echoCaption clips each quote to 450 characters, so the caption stays under 1024 with both quotes closed', () => {
  const echo = lines.echoCaption('Nikos', 'a'.repeat(2000), 'Sofia', 'b'.repeat(2000));
  expect(echo).toContain(`«${'a'.repeat(449)}…»`);
  expect(echo).toContain(`«${'b'.repeat(449)}…»`);
  expect(echo.length).toBeLessThan(1024);
  expect(echo.endsWith('…»')).toBe(true);
});

test('the clip keeps whole emoji and stays inside 600 UTF-16 units', () => {
  expect(lines.invitation('Sofia', `${'a'.repeat(597)}😀😀😀`)).toContain(`«${'a'.repeat(597)}😀…»`);
  expect(lines.invitation('Sofia', `${'a'.repeat(597)}👨‍👩‍👧 end`)).toContain(`«${'a'.repeat(597)}…»`);
  expect(lines.invitation('Sofia', `${'a'.repeat(596)}🇬🇷🇬🇷`)).toContain(`«${'a'.repeat(596)}…»`);
  expect(lines.memoryCaption('One week ago', 'Sofia', '😀'.repeat(700))).toContain(`«${'😀'.repeat(299)}…»`);
});
