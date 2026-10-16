import type { App } from "obsidian";
import { stamp } from "../model/dates";

/**
 * Fork: the repository's `saveAttachment`. Saves the image where the vault's attachment setting
 * puts files for `sourcePath`, under Obsidian's own name for a paste ("Pasted image
 * YYYYMMDDHHmmss"), and returns its embed in the vault's link style.
 */
export async function saveAttachment(
  app: App,
  data: ArrayBuffer,
  extension: string,
  sourcePath: string,
): Promise<string> {
  const now = new Date();
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const name = `Pasted image ${stamp(now).replace(/\D/g, "")}${seconds}.${extension}`;
  const fm = app.fileManager;
  const path = await fm.getAvailablePathForAttachment(name, sourcePath);
  const file = await app.vault.createBinary(path, data);
  return `!${fm.generateMarkdownLink(file, sourcePath)}`;
}
