// Fork addition: previous/next in the card panel's header, through the cards of the open card's
// column (and lane) in the order the board draws them. Every column writes what it draws (search,
// lane rule, grouping and sort applied) into one map while it renders, and the panel, rendered
// after the board in the same pass, reads it back.

import { createContext, useContext, useEffect, useRef } from "react";
import { plainColumnId } from "../model/swimlanes";
import type { Card } from "../model/types";
import { useBoardActions } from "./context";
import { HostIconButton } from "./hostControls";
import { queueNeighbours, ReviewQueueContext } from "./ReviewQueue";
import type { CardPanelState } from "./useCardPanel";

/** Column id (lane-qualified on a board with lanes) to the paths it draws, top to bottom. */
export type ColumnOrder = Map<string, readonly string[]>;

/**
 * A new map every board render, so a column or lane that is gone leaves nothing behind. Columns
 * are not memoized, so every board render redraws, and so re-records, all of them.
 */
export const ColumnOrderContext = createContext<ColumnOrder | null>(null);

/** Record what a column draws, group by group, in the order it draws it. */
export function useRecordColumnOrder(
  columnId: string,
  groups: readonly { cards: readonly Card[] }[],
): void {
  useContext(ColumnOrderContext)?.set(
    columnId,
    groups.flatMap((g) => g.cards.map((c) => c.path)),
  );
}

/**
 * The cards drawn just above and below `card` in its own column, or null at an end. A card a lane
 * rule mirrors elsewhere steps through the column its status puts it in; a subcard drawn only
 * nested under its parent is in no column's list and has no neighbours.
 */
export function columnNeighbours(
  order: ColumnOrder | null,
  card: Card,
): { prev: string | null; next: string | null } {
  const status = String(card.frontmatter.status ?? "");
  let list: readonly string[] = [];
  for (const [id, paths] of order ?? []) {
    if (!paths.includes(card.path)) continue;
    list = paths;
    if (plainColumnId(id) === status) break;
  }
  const i = list.indexOf(card.path);
  return { prev: list[i - 1] ?? null, next: i < 0 ? null : (list[i + 1] ?? null) };
}

/**
 * The two buttons, and Alt+Up / Alt+Down from anywhere in the panel. Stepping keeps the tab that
 * is open. At either end a button is switched off, not hidden, so the header does not jump.
 */
export function CardStepButtons({ card, panel }: { card: Card; panel: CardPanelState }) {
  const actions = useBoardActions();
  const queue = useContext(ReviewQueueContext);
  const order = useContext(ColumnOrderContext);
  const queued = queueNeighbours(queue, card.path);
  const { prev, next } = queued ?? columnNeighbours(order, card);
  // In the review queue each card opens on the tab its job is on; in a column the tab stays.
  const step = (to: string | null) => {
    if (to !== null) actions.open(to, queued && queue ? queue.tabOf(to) : panel.tab);
  };
  const latest = useRef({ prev, next, step });
  latest.current = { prev, next, step };
  // A listener on the dialog element, not a JSX `onKeyDown`: the shortcut belongs to the whole
  // panel, which is no interactive element of its own.
  const { panelRef } = panel.focus;
  useEffect(() => {
    const el = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const l = latest.current;
      l.step(e.key === "ArrowUp" ? l.prev : l.next);
    };
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [panelRef]);
  return (
    <>
      {queued && (
        <span className="folia-muted" aria-label="Review queue">
          {queued.index + 1}/{queued.total}
        </span>
      )}
      <HostIconButton
        className="folia-detail-icon folia-detail-action"
        icon="chevron-up"
        label={queued ? "Previous in review queue (Alt+↑)" : "Previous card in column (Alt+↑)"}
        disabled={prev === null}
        onClick={() => step(prev)}
      />
      <HostIconButton
        className="folia-detail-icon folia-detail-action"
        icon="chevron-down"
        label={queued ? "Next in review queue (Alt+↓)" : "Next card in column (Alt+↓)"}
        disabled={next === null}
        onClick={() => step(next)}
      />
    </>
  );
}
