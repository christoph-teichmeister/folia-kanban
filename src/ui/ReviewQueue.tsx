// Fork addition: the review queue. One click on the toolbar walks the user through every card that
// waits on them: cards in `po-review`, and Claude's cards tagged `feedback-needed`. A card due on a
// later day waits for that day; overdue cards stay in. The list is a
// snapshot taken at the start, so answering a card does not reshuffle what is still ahead. The
// panel's previous/next (and Approve, Send back, Approve commands, Send & next) step through it
// until the panel closes.
import { createContext, useMemo, useState } from "react";
import type { Board, Card } from "../model/types";
import type { PanelTab } from "./context";

const REVIEW_STATUS = "po-review";
const FEEDBACK_TAG = "feedback-needed";
const DONE_STATUS = "done";

export interface ReviewQueue {
  /** The paths being walked, or null while no queue is running. */
  paths: readonly string[] | null;
  /** How many cards a new queue would hold. */
  count: number;
  start: () => void;
  /** The tab a card of the queue opens on: its review box, or the question in its comments. */
  tabOf(path: string): PanelTab;
}

export const ReviewQueueContext = createContext<ReviewQueue | null>(null);

const hasFeedbackTag = (tags: unknown) =>
  tags === FEEDBACK_TAG || (Array.isArray(tags) && tags.includes(FEEDBACK_TAG));

/** Cards in review first, then the questions, each group by path. Cards due later wait. */
export function queueCandidates(board: Board, today: string): string[] {
  const review: string[] = [];
  const feedback: string[] = [];
  for (const c of Object.values(board.cards)) {
    const fm = c.frontmatter;
    // YYYY-MM-DD strings compare in date order.
    if (typeof fm.due === "string" && fm.due > today) continue;
    if (fm.status === REVIEW_STATUS) review.push(c.path);
    else if (fm["owner"] === "claude" && fm.status !== DONE_STATUS && hasFeedbackTag(fm["tags"]))
      feedback.push(c.path);
  }
  return [...review.sort(), ...feedback.sort()];
}

export const tabForCard = (card: Card | undefined): PanelTab =>
  card?.frontmatter.status === REVIEW_STATUS ? "overview" : "comments";

/** The cards around `path` in the running queue, or null when `path` is not in it. */
export function queueNeighbours(
  queue: ReviewQueue | null,
  path: string,
): { prev: string | null; next: string | null; index: number; total: number } | null {
  const paths = queue?.paths;
  const i = paths ? paths.indexOf(path) : -1;
  if (!paths || i < 0) return null;
  return { prev: paths[i - 1] ?? null, next: paths[i + 1] ?? null, index: i, total: paths.length };
}

/** The queue's state for the app: the paths of a running walk, and the count a new one would hold. */
export function useReviewQueue(
  board: Board | null,
  today: string,
  selected: string | null,
  open: (path: string, tab: PanelTab) => void,
): ReviewQueue {
  const [paths, setPaths] = useState<readonly string[] | null>(null);
  // The walk ends with the panel: once no card is open, a closed panel has nothing to step from.
  if (paths && selected === null) setPaths(null);
  const candidates = useMemo(() => (board ? queueCandidates(board, today) : []), [board, today]);
  return {
    paths,
    count: candidates.length,
    tabOf: (path) => tabForCard(board?.cards[path]),
    start: () => {
      const first = candidates[0];
      if (first === undefined) return;
      setPaths(candidates);
      open(first, tabForCard(board?.cards[first]));
    },
  };
}
