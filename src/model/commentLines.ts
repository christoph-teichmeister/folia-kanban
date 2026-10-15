// Fork addition: how a comment with several lines sits in the note, and how it is read back.
// A bullet line starts a comment; a blank line alone would end it, and the paragraphs after it would
// read as stray comments of their own. So every line after the first is indented two spaces, which
// keeps them in the same list item.

/** A comment's text as it goes into the note after its bullet. */
export function entryText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l, i) => (i === 0 ? l : l.trim() === "" ? "" : `  ${l}`))
    .join("\n");
}

/**
 * Whether line `i` belongs to `last`, the entry before it: it is indented under a bullet that
 * starts at column 0, even past blank lines or when it is itself a list item.
 */
export function continuesEntry(
  lines: readonly string[],
  i: number,
  last: { from: number; bullet: boolean } | undefined,
): boolean {
  return (
    !!last?.bullet && /^(?: {2}|\t)/.test(lines[i] ?? "") && /^\S/.test(lines[last.from] ?? "")
  );
}
