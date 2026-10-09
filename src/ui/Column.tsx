import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS, type Transform } from "@dnd-kit/utilities";
import type { Board, ColumnDef } from "../model/types";
import type { DragReloc } from "../model/board";
import type { Filter } from "../model/filter";
import { Icon } from "./icons";
import { HostButton, HostIconButton } from "./hostControls";
import { useReducedMotion } from "./useReducedMotion";
import { useBoardActions, useColumnCollapse } from "./context";
import { plainColumnId } from "../model/swimlanes";
import { columnAccent } from "./columnColors";
import { CardComposer, useCardComposer } from "./CardComposer";
import { ColumnCards } from "./ColumnCards";
import { ColumnMenuButton } from "./ColumnMenuButton";
import { useColumnCards } from "./useColumnCards";

interface Props {
  column: ColumnDef;
  cardPaths: string[];
  board: Board;
  today: string;
  selectedPath: string | null;
  wipLimit?: number;
  filter: Filter;
  doneColumnId: string | null;
  isFirst: boolean;
  isLast: boolean;
  /** A live cross-column relocation in progress (set on every column while a card is dragged across).
   *  When this column is the relocation's target, the relocated card must keep its ORIGINAL sortable
   *  id (`dragReloc.activeId`) instead of this column's namespaced id, or dnd-kit unmounts the active
   *  sortable mid-drag and the make-room/drop tween breaks. */
  dragReloc?: DragReloc;
  /** False when the card was refused, which leaves the title in the composer to be fixed. */
  onAddCard: (columnId: string, title: string) => boolean;
}

/** Folding is kept on this device, see `useColumnCollapse`; a folded column keeps its place and animates shut. */
export function Column(props: Props) {
  const [folded, toggle] = useColumnCollapse(
    props.board.config.path,
    plainColumnId(props.column.id),
  );
  return <OpenColumn {...props} folded={folded} onFold={toggle} />;
}

function OpenColumn({
  folded,
  onFold,
  column,
  cardPaths,
  board,
  today,
  selectedPath,
  wipLimit,
  filter,
  doneColumnId,
  isFirst,
  isLast,
  dragReloc,
  onAddCard,
}: Props & { folded: boolean; onFold: () => void }) {
  // The column is itself a sortable item (header drag-reorder, #2). Its sortable id IS column.id,
  // which doubles as the body's droppable id — so a card dropped on this column still reports
  // over.id === column.id and resolveDrop keeps bucketing card drops unchanged. (No separate
  // useDroppable: that would register a second droppable under the same id and collide.)
  const reducedMotion = useReducedMotion();
  const sortable = useSortable(sortableOptions(column.id, reducedMotion));
  const composer = useCardComposer(column, onAddCard);
  const titleEdit = useColumnTitleEdit(column, sortable.isDragging);
  const cards = useColumnCards({
    column,
    cardPaths,
    board,
    filter,
    today,
    doneColumnId,
    dragReloc,
  });

  // Drop INTO a filter-lane stays minimal: the move path sets `status` to this column's id, and a
  // lane is a view, not an owner of membership (#1.6).
  const overLimit = wipLimit != null && cards.count > wipLimit;
  return (
    <section
      // The column root IS the sortable node (header drag-reorder, #2) AND carries colcfg's #10
      // de-emphasis. setNodeRef is the sortable's droppable ref too, so a card dropped on this
      // column still reports over.id === column.id (no separate useDroppable).
      ref={sortable.setNodeRef}
      className={
        columnClassName(column, overLimit, sortable.isDragging) + (folded ? " folia-is-folded" : "")
      }
      data-testid="column"
      data-column={column.id}
      style={columnStyle(column, sortable.transform, sortable.transition)}
    >
      {folded && <FoldStrip column={column} count={cards.count} onExpand={onFold} />}
      <ColumnHeader
        column={column}
        titleEdit={titleEdit}
        handle={sortable}
        count={cards.count}
        wipLimit={wipLimit}
        overLimit={overLimit}
        onFold={onFold}
      >
        <ColumnMenuButton
          column={column}
          board={board}
          paths={cards.paths}
          isFirst={isFirst}
          isLast={isLast}
        />
      </ColumnHeader>
      {/* No ref here: the section root is the sortable/droppable node (its id === column.id), so a
          card dropped anywhere on the column still reports over.id === column.id. `isOver` comes
          from useSortable and still drives the body drop highlight. */}
      <div className={"folia-column-body" + (sortable.isOver ? " folia-is-over" : "")}>
        <ColumnBodyContent
          cards={cards}
          board={board}
          today={today}
          selectedPath={selectedPath}
          filter={filter}
          composer={composer}
        />
      </div>
      {!composer.adding && (
        <ColumnFooter column={column} takesAdds={cards.takesAdds} onAdd={composer.start} />
      )}
    </section>
  );
}

/** The add control, or, for a lane no added card could join, the rule that fills it. */
function ColumnFooter({
  column,
  takesAdds,
  onAdd,
}: {
  column: ColumnDef;
  takesAdds: boolean;
  onAdd: () => void;
}) {
  return takesAdds ? (
    <button className="folia-column-add" aria-label={`Add card to ${column.title}`} onClick={onAdd}>
      <Icon name="plus" />
      Add a card
    </button>
  ) : (
    <p className="folia-column-rule">
      Cards matching <code>{column.filter}</code> appear here
    </p>
  );
}

function EmptyColumn({ filtering }: { filtering: boolean }) {
  return filtering ? (
    <div className="folia-column-empty folia-is-filtered">
      <span>No matches</span>
    </div>
  ) : (
    <div className="folia-column-empty" aria-hidden="true">
      <Icon name="inbox" />
      <span>Nothing here</span>
    </div>
  );
}

/**
 * Inline title edit (#7). A click on the title (no meaningful drag movement) enters edit mode;
 * the ≥5px movement threshold that distinguishes drag from click is the dnd sensor's own
 * activationConstraint (distance: 5) — once it fires, dnd takes the pointer and the click never
 * arrives, so click === "did not drag". `justDragged` is a belt-and-braces guard against a
 * trailing click some browsers synthesize after a completed drag.
 */
function useColumnTitleEdit(column: ColumnDef, isDragging: boolean) {
  const actions = useBoardActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.title);
  const justDragged = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDragging) justDragged.current = true;
  }, [isDragging]);

  // Reset the draft if the column title changes underneath us (e.g. a rename from the menu).
  useEffect(() => {
    if (!editing) setDraft(column.title);
  }, [column.title, editing]);

  useEffect(() => {
    if (editing) {
      const el = inputRef.current;
      el?.focus();
      el?.select();
    }
  }, [editing]);

  // Enter on the handle starts editing without the post-drag guard a click goes through.
  const start = () => {
    setDraft(column.title);
    setEditing(true);
  };
  const enterEdit = () => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    start();
  };
  const commit = () => {
    if (!editing) return;
    const t = draft.trim();
    if (t && t !== column.title) actions.renameColumn(column.id, t);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(column.title);
    setEditing(false);
  };
  return { editing, draft, setDraft, justDragged, inputRef, start, enterEdit, commit, cancel };
}

function ColumnHeader({
  column,
  titleEdit,
  handle,
  count,
  wipLimit,
  overLimit,
  onFold,
  children,
}: {
  column: ColumnDef;
  titleEdit: ReturnType<typeof useColumnTitleEdit>;
  handle: Pick<ReturnType<typeof useSortable>, "setActivatorNodeRef" | "attributes" | "listeners">;
  count: number;
  wipLimit: number | undefined;
  overLimit: boolean;
  /** Fork addition: fold the column to a strip. */
  onFold: () => void;
  /** The column's menu button. */
  children: ReactNode;
}) {
  return (
    <header className="folia-column-header">
      <span className="folia-column-dot" aria-hidden="true" />
      {titleEdit.editing ? (
        <input
          ref={titleEdit.inputRef}
          className="folia-column-title-input"
          value={titleEdit.draft}
          aria-label={`Rename column ${column.title}`}
          onChange={(e) => titleEdit.setDraft(e.target.value)}
          onBlur={titleEdit.commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              titleEdit.commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              titleEdit.cancel();
            }
          }}
        />
      ) : (
        <ColumnTitle column={column} titleEdit={titleEdit} handle={handle} />
      )}
      <span
        className={"folia-column-count" + (overLimit ? " folia-is-over-limit" : "")}
        role="img"
        aria-label={countLabel(count, wipLimit, overLimit)}
      >
        {overLimit && <Icon name="triangle-alert" />}
        {wipLimit != null ? `${count}/${wipLimit}` : count}
      </span>
      <HostIconButton
        className="folia-detail-icon folia-mini folia-column-fold-btn"
        icon="chevrons-left"
        label={`Collapse ${column.title}`}
        onClick={onFold}
      />
      {children}
    </header>
  );
}

// ONE header DOM, two intents (§4): the title span is the drag handle (activator + listeners) AND
// the click target for inline edit. dnd's distance:5 sensor decides: ≥5px movement → drag (the
// click never fires); a clean click → enterEdit.
function ColumnTitle({
  column,
  titleEdit,
  handle,
}: {
  column: ColumnDef;
  titleEdit: ReturnType<typeof useColumnTitleEdit>;
  handle: Pick<ReturnType<typeof useSortable>, "setActivatorNodeRef" | "attributes" | "listeners">;
}) {
  const { setActivatorNodeRef, attributes, listeners } = handle;
  return (
    // a11y exception (no-static-element-interactions): role + tabIndex come from the spread dnd attributes (drag handle); click enters rename
    <span
      ref={setActivatorNodeRef}
      className="folia-column-title"
      aria-label={`${column.title}, drag to reorder, click to rename`}
      {...attributes}
      {...listeners}
      // Clear any stale post-drag guard at the very start of a fresh gesture, THEN hand the
      // event to dnd's own pointerdown listener. If a real drag follows, the isDragging
      // effect re-arms the flag; if it's a clean click, the flag stays false and the click
      // enters edit. This prevents a suppressed trailing click from eating a later genuine one.
      onPointerDown={(e) => {
        titleEdit.justDragged.current = false;
        listeners?.["onPointerDown"]?.(e);
      }}
      onClick={titleEdit.enterEdit}
      onKeyDown={(e) => {
        // Keyboard affordance for rename (Enter/Space) — the drag listeners own Space for
        // pickup, so only act on a key we add here without breaking the dnd keyboard sensor.
        if (e.key === "Enter") {
          e.preventDefault();
          titleEdit.start();
        }
      }}
    >
      {column.title}
    </span>
  );
}

function countLabel(count: number, wipLimit: number | undefined, overLimit: boolean): string {
  if (overLimit) return `${count} of ${wipLimit}, over the WIP limit`;
  return wipLimit != null ? `${count} of ${wipLimit} cards (WIP limit)` : `${count} cards`;
}

function columnClassName(column: ColumnDef, overLimit: boolean, isDragging: boolean): string {
  return (
    "folia-column" +
    (overLimit ? " folia-is-over-limit" : "") +
    (isFaded(column) ? " folia-is-faded" : "") +
    (column.parked === true ? " folia-is-parked" : "") +
    (isDragging ? " folia-is-dragging" : "")
  );
}

// #10 — de-emphasis. opacity fades the resting column; hoverOpacity reveals it on hover (default:
// reveal to full when faded). parked shoves the column to the far right (flex `order`) with a
// large left margin so a rabbit-hole column hides off-screen. All purely presentational.
function isFaded(column: ColumnDef): boolean {
  return typeof column.opacity === "number" && column.opacity < 1;
}

function columnStyle(
  column: ColumnDef,
  transform: Transform | null,
  transition: string | undefined,
): Record<string, string | number | undefined> {
  const style: Record<string, string | number | undefined> = {
    ["--folia-col-accent" as string]: columnAccent(column.color || "var(--interactive-accent)"),
    // Header drag-reorder (#2): the sortable's live transform/transition move the column as it
    // drags. `transition` is undefined when idle, which React simply omits.
    transform: CSS.Transform.toString(transform),
    transition,
  };
  if (isFaded(column)) {
    style["--folia-col-opacity"] = column.opacity;
    style["--folia-col-hover-opacity"] =
      typeof column.hoverOpacity === "number" ? column.hoverOpacity : 1;
  }
  return style;
}

function sortableOptions(id: string, reducedMotion: boolean) {
  return reducedMotion ? { id, transition: null } : { id };
}

/** The cards, the empty-column hint and the add-card composer of an open column. */
function ColumnBodyContent({
  cards,
  board,
  today,
  selectedPath,
  filter,
  composer,
}: {
  cards: ReturnType<typeof useColumnCards>;
  board: Board;
  today: string;
  selectedPath: string | null;
  filter: Filter;
  composer: ReturnType<typeof useCardComposer>;
}) {
  return (
    <>
      <ColumnCards
        cards={cards}
        board={board}
        today={today}
        selectedPath={selectedPath}
        filter={filter}
      />
      {cards.paths.length === 0 &&
        !composer.adding &&
        // An empty lane that names its rule below already says why it is empty; "No matches" is
        // left for a search, which the rule line does not explain.
        (cards.takesAdds || cards.globalFiltering) && <EmptyColumn filtering={cards.filtering} />}
      {composer.adding && <CardComposer composer={composer} fillNote={cards.fillNote} />}
    </>
  );
}

/** The click target of a folded column: its title and card count, written vertically. */
function FoldStrip({
  column,
  count,
  onExpand,
}: {
  column: ColumnDef;
  count: number;
  onExpand: () => void;
}) {
  return (
    <HostButton
      className="folia-btn folia-column-fold"
      slotClassName="folia-column-fold-slot"
      text={`${column.title} · ${count}`}
      aria-label={`Expand ${column.title} (${count} cards)`}
      onClick={onExpand}
    />
  );
}
