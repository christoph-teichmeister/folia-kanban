import { useMemo, type ComponentProps } from "react";
import { columnOf } from "../model/boardColumns";
import { laneModel, laneOfColumnId, laneValue, plainColumnId } from "../model/swimlanes";
import type { Card } from "../model/types";
import { Board } from "./Board";
import { useRepo } from "./context";

type Props = ComponentProps<typeof Board>;

/**
 * Fork addition: the board as lanes. One drag context holds every lane, so a card can be dragged
 * between columns and lanes; dropping it in another lane writes that lane's value too. Lane column
 * ids are qualified (see `src/model/swimlanes.ts`) and made plain again before anything is written.
 */
export function Swimlanes({ by, ...props }: { by: string } & Props) {
  const repo = useRepo();
  const { board, onMove, onAddCard } = props;
  const model = useMemo(() => laneModel(board, by, board.config.swimlaneSkip ?? []), [board, by]);
  const move = (card: Card, overId: string) => {
    void (async () => {
      const lane = targetLane(props.board, by, card, overId);
      if (lane !== null && lane !== laneValue(card, by)) {
        if (lane === "") await repo.unsetFrontmatterKey(card.path, by);
        else await repo.setFrontmatter(card.path, { [by]: lane });
      }
      onMove(card, plainColumnId(overId));
    })();
  };
  return (
    <Board
      {...props}
      board={model.board}
      wipLimits={{}}
      onMove={move}
      onAddCard={(columnId, title) => onAddCard(plainColumnId(columnId), title)}
      layout={(row) => (
        <div className="folia-lanes">
          {model.left.length > 0 && (
            <div className="folia-lane-left">{row(model.left, "left")}</div>
          )}
          <div className="folia-lane-stack">
            {model.lanes.map((lane) => (
              <section
                key={lane.value}
                className="folia-lane"
                aria-label={lane.value || `No ${by}`}
              >
                <h3 className="folia-lane-title">
                  {lane.value || `No ${by}`} <span className="folia-muted">{lane.count}</span>
                </h3>
                {row(lane.columns, lane.value)}
              </section>
            ))}
          </div>
        </div>
      )}
    />
  );
}

/** The lane a drop lands in, or null when it lands in a column that has no lanes. */
function targetLane(board: Props["board"], by: string, card: Card, overId: string): string | null {
  const fromColumn = laneOfColumnId(overId);
  if (fromColumn !== null) return fromColumn;
  const over = board.cards[overId];
  if (!over || over.path === card.path) return null;
  const skipped = board.config.swimlaneSkip ?? [];
  const col = columnOf(board, overId);
  return col !== null && skipped.includes(col) ? null : laneValue(over, by);
}
