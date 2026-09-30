/**
 * The note a rendered link points at, read from the anchor's `href` attribute, or `null` when the
 * link is not one to follow into the vault: a URL scheme (`https:`, `mailto:`, `obsidian:`, …) is
 * the browser's and Obsidian's to handle, and a leading `#` (a tag, a footnote, a same-note
 * heading) points inside the note itself.
 *
 * The attribute is the linktext as Obsidian recorded it, not a URL, so it is returned as it is.
 * Decoding it would turn a note named `A%20B` into `A B`, a note that does not exist.
 */
export function vaultLinktext(href: string | null): string | null {
  if (!href || href.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(href)) return null;
  return href;
}
