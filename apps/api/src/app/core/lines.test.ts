import { expect, test } from 'vitest';
import { lines } from './lines';

test('invitation and memoryCaption clip a long quote to 600 characters that end with …', () => {
  const long = 'a'.repeat(2000);
  const clip = `«${'a'.repeat(599)}…»`;
  expect(lines.invitation('Sofia', long)).toContain(clip);
  expect(lines.memoryCaption('One week ago', 'Sofia', long)).toContain(clip);
  expect(lines.invitation('Sofia', 'b'.repeat(600))).toContain(`«${'b'.repeat(600)}»`);
});

test('the clip never splits an emoji', () => {
  expect(lines.invitation('Sofia', `${'a'.repeat(598)}😀😀😀`)).toContain(`«${'a'.repeat(598)}😀…»`);
});
