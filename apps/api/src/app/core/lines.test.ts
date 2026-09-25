import { expect, test } from 'vitest';
import { lines } from './lines';

test('invitation and memoryCaption clip a long quote to 600 characters that end with …', () => {
  const long = 'a'.repeat(2000);
  const clip = `«${'a'.repeat(599)}…»`;
  expect(lines.invitation('Sofia', long)).toContain(clip);
  expect(lines.memoryCaption('One week ago', 'Sofia', long)).toContain(clip);
  expect(lines.invitation('Sofia', 'b'.repeat(600))).toContain(`«${'b'.repeat(600)}»`);
});

test('storyAdded and echoCaption clip each quote to 600 characters', () => {
  const long = 'a'.repeat(2000);
  const clip = `«${'a'.repeat(599)}…»`;
  expect(lines.storyAdded('Nikos', 'Sofia', long)).toContain(clip);
  const echo = lines.echoCaption('Nikos', long, 'Sofia', long);
  expect(echo.split(clip)).toHaveLength(3);
});

test('the clip keeps whole emoji and stays inside 600 UTF-16 units', () => {
  expect(lines.invitation('Sofia', `${'a'.repeat(597)}😀😀😀`)).toContain(`«${'a'.repeat(597)}😀…»`);
  expect(lines.invitation('Sofia', `${'a'.repeat(597)}👨‍👩‍👧 end`)).toContain(`«${'a'.repeat(597)}…»`);
  expect(lines.invitation('Sofia', `${'a'.repeat(596)}🇬🇷🇬🇷`)).toContain(`«${'a'.repeat(596)}…»`);
  expect(lines.memoryCaption('One week ago', 'Sofia', '😀'.repeat(700))).toContain(`«${'😀'.repeat(299)}…»`);
});
