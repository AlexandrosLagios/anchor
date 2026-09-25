const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;

export function wordCount(text: string | undefined): number {
  return (text ?? '').replace(LINK, ' ').split(/\s+/).filter(Boolean).length;
}
