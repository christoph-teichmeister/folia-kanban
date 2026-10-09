// Fork addition: horizontal lanes. A board note with `swimlanes: owner` draws one row of columns per
// value of that card property, and `swimlane-skip` names columns drawn once, left of the lanes.
// Lane columns get ids qualified with their lane (`next§you`) so one drag-and-drop context can hold
// them all; `plainColumnId` and `laneOfColumnId` take the id apart again at the write boundary.

import type { Board, Card, ColumnDef } from "./types";

const SEP = "§";
const DEFAULT_LANE = "you";

export interface Lane {
  /** The property value. */
  value: string;
  columns: ColumnDef[];
  count: number;
}

/** The board as one drag-and-drop context sees it, and how to lay it out. */
export interface LaneModel {
  board: Board;
  left: ColumnDef[];
  lanes: Lane[];
}

/** A card's lane value: a string, or the first entry of a list; "" when absent. */
export function laneValue(card: Card | undefined, key: string): string {
  const v: unknown = card?.frontmatter[key];
  const first: unknown = Array.isArray(v) ? (v as unknown[])[0] : v;
  return typeof first === "string" ? first.trim() : "";
}

/** The lane a card is drawn in: its value, or `you` when it has none (every card has an owner). */
export function cardLane(card: Card | undefined, key: string): string {
  return laneValue(card, key) || DEFAULT_LANE;
}

/** The real column id behind a lane column id (a plain id comes back unchanged). */
export function plainColumnId(id: string): string {
  const i = id.indexOf(SEP);
  return i < 0 ? id : id.slice(0, i);
}

/** The lane value a lane column id belongs to, or null for a plain column id. */
export function laneOfColumnId(id: string): string | null {
  const i = id.indexOf(SEP);
  return i < 0 ? null : id.slice(i + SEP.length);
}

/**
 * Split the board into lanes. `you` comes first, other values follow alphabetically and cards
 * without a value come last. ponytail: the order is fixed, add a board property if it ever needs
 * to be configurable.
 */
export function laneModel(board: Board, key: string, skip: readonly string[] = []): LaneModel {
  const skipped = new Set(skip);
  const left = board.config.columns.filter((c) => skipped.has(c.id));
  const laned = board.config.columns.filter((c) => !skipped.has(c.id));
  const values = new Set<string>(["you", "claude"]);
  for (const c of laned)
    for (const p of board.columns[c.id] ?? []) values.add(cardLane(board.cards[p], key));
  const rank = (v: string) => (v === "you" ? 0 : 1);
  const columns: Record<string, string[]> = {};
  for (const c of left) columns[c.id] = board.columns[c.id] ?? [];
  const lanes = [...values]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((value): Lane => {
      const defs = laned.map((c) => {
        const id = `${c.id}${SEP}${value}`;
        columns[id] = (board.columns[c.id] ?? []).filter(
          (p) => cardLane(board.cards[p], key) === value,
        );
        return { ...c, id };
      });
      return {
        value,
        columns: defs,
        count: defs.reduce((n, d) => n + (columns[d.id]?.length ?? 0), 0),
      };
    });
  const all = [...left, ...lanes.flatMap((l) => l.columns)];
  return { board: { ...board, config: { ...board.config, columns: all }, columns }, left, lanes };
}
