import type { Vault } from "obsidian";

/**
 * Whether a new note or folder would land on something already in the vault, ignoring letter case
 * on every platform. That is how Obsidian's own `Vault.getAvailablePath` judges it, even on Linux:
 * a vault synced to macOS or Windows would otherwise have two names for one file there. Neither
 * that method nor its case-insensitive lookup is in `obsidian.d.ts`, hence this copy of the rule.
 *
 * `except` is the one path a rename moves away from, so a case-only rename is not its own collision.
 */
export function pathTaken(vault: Vault, except?: string): (path: string) => boolean {
  const taken = new Set(
    vault
      .getAllLoadedFiles()
      .filter((f) => f.path !== except)
      .map((f) => f.path.toLowerCase()),
  );
  return (path) => taken.has(path.toLowerCase());
}
