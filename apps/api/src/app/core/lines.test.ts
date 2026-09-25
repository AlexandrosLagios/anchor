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

test('the consent, stop, and just-ask lines read as the design writes them', () => {
  expect(lines.welcome('Nikos')).toBe(
    "Hello Nikos 🙂 I'm Anchor. I'm not a person: I keep your family's photos and stories. " +
      "Now and then, and a little more often for you, I'll send you a moment the family shared. " +
      'Seeing moments again helps them stay with us. You can answer by voice or by text. ' +
      "There's no right answer, I share nothing unless you say yes, and you can send /stop at any time. Would you like that?",
  );
  expect(lines.agreed('Nikos')).toBe("Wonderful, Nikos 💛 I'll send you the first moment soon.");
  expect(lines.stopped).toBe("Of course. I won't send you any more moments. If you'd like them again, send /start.");
  expect(lines.tellDirectly("Maria's first day at school", '25 September 2026', 'Sofia')).toBe(
    "This is Maria's first day at school, from 25 September 2026. Sofia shared it 💛",
  );
  expect(lines.buttons.agree).toBe("Yes, I'd like that");
  expect(lines.buttons.whatIsThis).toBe('What is this?');
});
