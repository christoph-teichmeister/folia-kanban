// Fork addition: horizontal lanes. A board note with `swimlanes: owner` draws one row of columns per
// value of that card property. Lanes only filter what each column shows; every write still goes
// through the one board, so a card keeps its column and order whichever lane draws it.

import type { Board, Card } from "./types";

export interface Lane {
  /** The property value, or "" for cards that have none. */
  value: string;
  columns: Record<string, string[]>;
  count: number;
}

/** A card's lane value: a string, or the first entry of a list; "" when absent. */
export function laneValue(card: Card | undefined, key: string): string {
  const v: unknown = card?.frontmatter[key];
  const first: unknown = Array.isArray(v) ? (v as unknown[])[0] : v;
  return typeof first === "string" ? first.trim() : "";
}

/**
 * Split the board's columns into lanes. `you` comes first, other values follow alphabetically and
 * cards without a value come last. ponytail: the order is fixed, add a board property if it ever
 * needs to be configurable.
 */
export function boardLanes(board: Board, key: string): Lane[] {
  const values = new Set<string>(["you", "claude"]);
  for (const cards of Object.values(board.columns))
    for (const p of cards) values.add(laneValue(board.cards[p], key));
  const rank = (v: string) => (v === "you" ? 0 : v === "" ? 2 : 1);
  return [...values]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((value) => {
      const columns = Object.fromEntries(
        Object.entries(board.columns).map(([col, paths]) => [
          col,
          paths.filter((p) => laneValue(board.cards[p], key) === value),
        ]),
      );
      return { value, columns, count: Object.values(columns).reduce((n, l) => n + l.length, 0) };
    })
    .filter((lane) => lane.count > 0 || lane.value !== "");
}
