/**
 * The board view's type id, on its own so both the plugin (`src/main.ts`) and the vault adapter
 * (`src/obsidian/vaultRepo.ts`) can name it without either importing `src/view.tsx`, which imports
 * the adapter back. It is also the id Page preview knows Folia by, and the two halves of a hover
 * preview — the registration and the `hover-link` event — only line up while they use one string.
 */
export const VIEW_TYPE_KANBAN = "folia-kanban-view";

/**
 * The "Open board" command's name, shared with the empty view's message that tells the reader to
 * run it. Obsidian prefixes it with the plugin's name in the palette ("Folia Kanban: Open board").
 */
export const OPEN_BOARD_COMMAND_NAME = "Open board";
