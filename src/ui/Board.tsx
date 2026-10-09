import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import {
  DndContext,
  KeyboardSensor,
  TouchSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import type { Board as BoardModel, Card, ColumnDef } from "../model/types";
import type { DragReloc } from "../model/board";
import { applyReloc } from "../model/board";
import { Column } from "./Column";
import { AddColumn } from "./AddColumn";
import { useSettings } from "./context";
import type { Filter } from "../model/filter";
import { useReducedMotion } from "./useReducedMotion";
import { PanAwarePointerSensor, panModeRef, useBoardPan } from "./boardPan";
import { useBoardDrag } from "./useBoardDrag";
import { dragAnnouncements, screenReaderInstructions } from "./dragAnnouncements";
import { BoardDragOverlay } from "./BoardDragOverlay";

interface Props {
  board: BoardModel;
  today: string;
  selectedPath: string | null;
  wipLimits: Record<string, number>;
  filter: Filter;
  doneColumnId: string | null;
  /** A card drop: the card as it was when it was picked up, and the id it was released over. */
  onMove: (card: Card, overId: string) => void;
  onAddCard: (columnId: string, title: string) => boolean;
  /** Fork addition: lay the rows of columns out yourself (swimlanes); the board keeps one drag context. */
  layout?: (row: (columns: ColumnDef[], key: string) => ReactNode) => ReactNode;
}

/** Pointer (mouse), touch (long-press) and keyboard sensors for dragging cards and columns. */
function useBoardSensors(reducedMotion: boolean) {
  return useSensors(
    useSensor(PanAwarePointerSensor, {
      // A short distance threshold lets a click stay a click (never hijacked into a drag) while a
      // deliberate move past 5px crisply commits to a drag. The 5px also matches the column header's
      // click-vs-drag threshold (§4) so card and column drags feel consistent.
      activationConstraint: { distance: 5 },
    }),
    // Fork: long-press to pick a card up on touch screens; a plain swipe scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 10 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Space picks up / drops; Enter is left free for opening a focused card.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
      // Moving a card past the edge scrolls its container; dnd-kit smooths that scroll by default.
      scrollBehavior: reducedMotion ? "auto" : "smooth",
    }),
  );
}

export function Board({
  board,
  today,
  selectedPath,
  wipLimits,
  filter,
  doneColumnId,
  onMove,
  onAddCard,
  layout,
}: Props) {
  const { boardPan } = useSettings();
  // Keep the module-scoped ref the sensor (and the pan handler) reads in sync with the live
  // setting, so toggling it takes effect without re-binding listeners (see PanAwarePointerSensor).
  panModeRef.current = boardPan;

  const columnIds = board.config.columns.map((c) => c.id);
  const reducedMotion = useReducedMotion();
  const sensors = useBoardSensors(reducedMotion);
  const drag = useBoardDrag(board, columnIds, onMove);
  // Card sortables are namespaced `${columnId}::${card.path}` so a card mirrored into a cross-board
  // lane (#1) and its status column don't collide on one id. A column drag's active id is the bare
  // column id.
  const activeColumn =
    drag.activeId != null && columnIds.includes(drag.activeId)
      ? (board.config.columns.find((c) => c.id === drag.activeId) ?? null)
      : null;
  const boardRef = useRef<HTMLDivElement>(null);
  useBoardPan(boardRef);

  // The cards each plain status column should render WHILE a cross-column drag is open: the active
  // card shown moved into its target (gap opened). Lanes (filter columns) deliberately bypass this —
  // they derive from `board.columns` directly in Column, so their mirrors stay uncorrupted. The
  // override only flows through the plain status bucket each column is passed below.
  const effectiveColumns = applyReloc(board.columns, drag.dragReloc);
  const dragReloc = drag.dragReloc;

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements: dragAnnouncements(board, columnIds),
        screenReaderInstructions,
      }}
      collisionDetection={drag.collisionDetection}
      // Re-measure droppables continuously so the gap opened by `dragReloc` (a real layout shift in
      // the target column) is reflected mid-drag — otherwise dnd-kit keeps stale rects and the make-
      // room tween computes against the pre-gap layout.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      {...drag.handlers}
    >
      {(() => {
        const row = (columns: ColumnDef[], key: string): ReactNode => (
          <ColumnRow
            key={key}
            columns={columns}
            all={board.config.columns}
            cards={effectiveColumns}
            shared={{ board, today, selectedPath, wipLimits, filter, doneColumnId, onAddCard }}
            {...(dragReloc ? { dragReloc } : {})}
            pan={boardPan}
            {...(layout ? {} : { rowRef: boardRef })}
          />
        );
        return layout ? (
          <div className="folia-lanes-root" ref={boardRef}>
            {layout(row)}
          </div>
        ) : (
          row(board.config.columns, "all")
        );
      })()}
      {/* The guard only skips the pre-mount render, where no drag can be active. */}
      {boardRef.current && (
        <BoardDragOverlay
          body={boardRef.current.ownerDocument.body}
          reducedMotion={reducedMotion}
          activeColumn={activeColumn}
          activeCard={drag.activeCard}
          today={today}
          doneColumnId={doneColumnId}
        />
      )}
    </DndContext>
  );
}

/** One row of columns in a sortable context of its own (the whole board, or one lane). */
function ColumnRow({
  columns,
  all,
  cards,
  shared,
  dragReloc,
  pan,
  rowRef,
}: {
  columns: ColumnDef[];
  all: ColumnDef[];
  cards: Record<string, string[]>;
  shared: Pick<
    Props,
    "board" | "today" | "selectedPath" | "wipLimits" | "filter" | "doneColumnId" | "onAddCard"
  >;
  dragReloc?: DragReloc;
  pan: string;
  /** Set on the plain board's row only: the element panning and the drag overlay anchor to. */
  rowRef?: RefObject<HTMLDivElement>;
}) {
  const { board, today, selectedPath, wipLimits, filter, doneColumnId, onAddCard } = shared;
  // A new array every render makes dnd-kit think the items changed and write an inline
  // `transition: 0ms` on every column, which beats the stylesheet and kills the fold animation.
  const key = columns.map((c) => c.id).join("|");
  const ids = useMemo(() => key.split("|"), [key]);
  return (
    <div className="folia-board" data-pan={pan} {...(rowRef ? { ref: rowRef } : {})}>
      <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
        {columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            cardPaths={cards[col.id] ?? []}
            board={board}
            today={today}
            selectedPath={selectedPath}
            {...(wipLimits[col.id] !== undefined ? { wipLimit: wipLimits[col.id] } : {})}
            filter={filter}
            doneColumnId={doneColumnId}
            isFirst={col.id === all[0]?.id}
            isLast={col.id === all[all.length - 1]?.id}
            {...(dragReloc ? { dragReloc } : {})}
            onAddCard={onAddCard}
          />
        ))}
      </SortableContext>
      {rowRef && <AddColumn />}
    </div>
  );
}
