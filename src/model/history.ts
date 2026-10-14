// History policy + human-readable line builders. Pure and Obsidian-free.
//
// The adapter owns WHEN to write (it has the file + timestamp); this module owns WHETHER a
// given event is in scope and WHAT the line reads. The default scope is 'moves', under which
// the move/reorder path (handled directly in board.ts/applyMove, not gated here) is the only
// thing that emits history — none of the field/comment/subtask kinds below do.

import type { CardStats, ColumnDef, HistoryScope, RelationType } from "./types";
import { relationLabel, relationLinkText } from "./relationships";
import { dayDelta } from "./dates";

/** Mutation kinds consulted by the gating policy (move/reorder is handled directly in applyMove). */
export type HistoryEventKind = "priority" | "due" | "status" | "comment" | "subtask" | "relation";

const SCOPE_RANK: Record<HistoryScope, number> = { moves: 1, structural: 2, all: 3 };

// The minimum scope rank at which each event kind is allowed to emit history.
const EVENT_MIN_RANK: Record<HistoryEventKind, number> = {
  priority: 2,
  due: 2,
  status: 2,
  comment: 3,
  subtask: 3,
  // A relationship is a `[[wikilink]]` graph edge added and removed from the detail panel, exactly
  // like a subcard link — so it is logged under the same scope, not the stricter `structural` one.
  relation: 3,
};

/** Does `scope` permit a history line for `kind`? */
export function historyAllows(scope: HistoryScope, kind: HistoryEventKind): boolean {
  return SCOPE_RANK[scope] >= EVENT_MIN_RANK[kind];
}

// --- Human-readable line builders (one concise line per event) ---

export function priorityLine(value: string): string {
  return `Priority → ${value}`;
}
export function dueLine(value: string): string {
  return `Due → ${value}`;
}
export function statusLine(value: string): string {
  return `Status → ${value}`;
}
export function commentAddedLine(): string {
  return "Comment added";
}
export function commentEditedLine(): string {
  return "Comment edited";
}
export function commentRemovedLine(): string {
  return "Comment removed";
}
export function subtaskAddedLine(text: string): string {
  return `Subtask added: ${text}`;
}
export function subtaskDoneLine(text: string): string {
  return `Subtask done: ${text}`;
}
export function subtaskReopenedLine(text: string): string {
  return `Subtask reopened: ${text}`;
}
export function subtaskRemovedLine(text: string): string {
  return `Subtask removed: ${text}`;
}

// A relationship line starts with the type's label, read off its key the way the panel heading is
// (`blocks` → `Blocks`), so the adapter needs no vocabulary in hand to write it.
export function relationAddedLine(type: RelationType, target: string): string {
  return `${relationLabel(type)} added: ${relationLinkText(target)}`;
}
export function relationRemovedLine(type: RelationType, target: string): string {
  return `${relationLabel(type)} removed: ${relationLinkText(target)}`;
}

// --- Fork: how long a card has sat in its column, read back from its history ---

/**
 * Fork: the columns whose tiles say how long a card has been standing there, and from how many days
 * on. ponytail: constants, not settings; a per-board setting when someone needs other columns.
 */
export const STALE_COLUMNS: readonly string[] = ["waiting", "doing"];
export const STALE_AFTER_DAYS = 7;

/**
 * Fork: does this history line move the card somewhere? The board writes `Moved from A to B` (column
 * titles) on a move and `Status → id` when the status field is edited; `Reordered within A` and
 * `Moved subtask "…" from A to B` leave the card where it is.
 */
export function isMoveLine(text: string): boolean {
  return text.startsWith("Moved from ") || text.startsWith("Status → ");
}

/**
 * Fork: whole days since `move` put the card into `column`, or null when it says nothing about that
 * (no move recorded, or the latest move went somewhere else, so the card got here by a hand edit
 * the history cannot date).
 */
export function daysInColumn(
  move: CardStats["lastMove"],
  column: Pick<ColumnDef, "id" | "title">,
  today: string,
): number | null {
  if (!move) return null;
  const text = move.text.toLowerCase();
  const into =
    (text.startsWith("moved from ") && text.endsWith(` to ${column.title.toLowerCase()}`)) ||
    text === `status → ${column.id.toLowerCase()}`;
  if (!into) return null;
  // Today as the target, the move as "today": days elapsed, not days to go.
  return dayDelta(today, move.timestamp.slice(0, 10));
}
