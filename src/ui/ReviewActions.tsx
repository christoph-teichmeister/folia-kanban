// Fork addition: the PO review flow in the card panel. A card Claude finished waits in `po-review`
// with a `## For PO Review` section; the reviewer approves it (to `done`) or sends it back (to
// `doing`) from here, and a `## Commands to approve` section gets a one-click `ok`. Every answer is
// an ordinary comment, signed the way the Comments tab signs one, because the board runner reads
// the comments, not the buttons.
import { useContext, useState } from "react";
import type { Board, Card, CardBody } from "../model/types";
import { fencedLines } from "../model/fences";
import { writeStatus } from "./CardFields";
import { ColumnOrderContext, columnNeighbours } from "./CardStepper";
import { useBoardActions, useRepo } from "./context";
import { DetailDialogContext } from "./detailDialog";
import { HostButton } from "./hostControls";
import { Markdown } from "./Markdown";
import { queueNeighbours, ReviewQueueContext } from "./ReviewQueue";
import type { CardPanelState } from "./useCardPanel";

const REVIEW_STATUS = "po-review";
const REVIEW_HEADING = "For PO Review";
const COMMANDS_HEADING = "Commands to approve";
const FEEDBACK_TAG = "feedback-needed";

const H2_RE = /^ {0,3}##\s+(.*?)\s*#*\s*$/;
const H1_OR_H2_RE = /^ {0,3}#{1,2}\s/;

/**
 * The `## <heading>` section of a description (its body, without the heading line) and the
 * description without it; null when there is no such section. It runs to the next heading of level
 * one or two; headings inside a code fence do not count.
 */
export function splitSection(
  description: string,
  heading: string,
): { section: string; rest: string } | null {
  const lines = description.split("\n");
  const fenced = fencedLines(lines);
  const want = heading.toLowerCase();
  const start = lines.findIndex((l, i) => !fenced[i] && H2_RE.exec(l)?.[1]?.toLowerCase() === want);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && !fenced[i] && H1_OR_H2_RE.test(l));
  if (end < 0) end = lines.length;
  return {
    section: lines
      .slice(start + 1, end)
      .join("\n")
      .trim(),
    rest: [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim(),
  };
}

/** `frontmatter.tags` without `tag`, or null when the card does not carry it there. */
export function withoutTag(tags: unknown, tag: string): string[] | null {
  const list = typeof tags === "string" ? [tags] : Array.isArray(tags) ? tags : [];
  if (!list.includes(tag)) return null;
  return list.filter((t): t is string => typeof t === "string" && t !== tag);
}

const inReview = (card: Card) => card.frontmatter.status === REVIEW_STATUS;

/**
 * What the Description section renders: on a card in review, everything but the `## For PO Review`
 * section, which `ReviewBox` already shows on top. Undefined means all of it.
 */
export function reviewedDescription(card: Card, body: CardBody | null): string | undefined {
  if (!body || !inReview(card)) return undefined;
  return splitSection(body.description, REVIEW_HEADING)?.rest;
}

interface Props {
  path: string;
  board: Board;
  card: Card;
  panel: CardPanelState;
}

/** Add a comment exactly as the Comments tab does, so the unread markers know it is yours. */
function usePostComment(path: string, panel: CardPanelState) {
  const repo = useRepo();
  return async (text: string) => {
    const floor = panel.body?.comments.length ?? 0;
    await repo.addComment(path, text);
    if (panel.stillHere()) panel.readState.posted({ floor, text });
  };
}

/** The top of a `po-review` card's Overview: what to check, then Approve / Send back. */
export function ReviewBox(props: Props) {
  if (!inReview(props.card)) return null;
  const section = splitSection(props.panel.body?.description ?? "", REVIEW_HEADING)?.section;
  return <ReviewForm {...props} section={section ?? ""} />;
}

function ReviewForm({ path, board, card, panel, section }: Props & { section: string }) {
  const repo = useRepo();
  const actions = useBoardActions();
  const dialog = useContext(DetailDialogContext);
  const post = usePostComment(path, panel);
  const order = useContext(ColumnOrderContext);
  const queue = useContext(ReviewQueueContext);
  const [note, setNote] = useState("");
  // Review flow: the answer moves the card out of the column, so the next card to review is picked
  // first and opened once the answer is written: the next one of a running review queue, else the
  // card below in the column, else the one above.
  const decide = (status: string, text: string) => {
    const queued = queueNeighbours(queue, path);
    const { prev, next } = columnNeighbours(order, card);
    const target = queued ? queued.next : (next ?? prev);
    void panel
      .mutate(async () => {
        if (!(await writeStatus({ repo, actions, board, card, path }, status))) return;
        await post(text);
      })
      .then((ok) => {
        if (!ok) return;
        if (panel.stillHere()) setNote("");
        if (target) actions.open(target, queued && queue ? queue.tabOf(target) : panel.tab);
      });
  };
  return (
    <section className="folia-review" aria-label="PO review">
      <h3>For PO review</h3>
      {section && (
        <Markdown
          markdown={section}
          sourcePath={path}
          className="folia-review-text"
          onFollowLink={() => dialog?.close()}
        />
      )}
      <div className="folia-add-inline">
        <textarea
          value={note}
          placeholder="Note (optional to approve, required to send back)"
          aria-label="Review note"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="folia-row-actions">
        <HostButton
          className="folia-btn"
          text="Approve"
          cta
          onClick={() => decide("done", note.trim() || "Approved.")}
        />
        <HostButton
          className="folia-btn"
          text="Send back"
          disabled={!note.trim()}
          onClick={() => note.trim() && decide("doing", note.trim())}
        />
      </div>
    </section>
  );
}

/** Beside a `## Commands to approve` section: answer `ok` and clear the `feedback-needed` tag. */
export function CommandsApproval(props: Omit<Props, "board">) {
  const description = props.panel.body?.description ?? "";
  return splitSection(description, COMMANDS_HEADING) ? <CommandsForm {...props} /> : null;
}

function CommandsForm({ path, card, panel }: Omit<Props, "board">) {
  const repo = useRepo();
  const actions = useBoardActions();
  const queue = useContext(ReviewQueueContext);
  const post = usePostComment(path, panel);
  const [except, setExcept] = useState("");
  const commands = splitSection(panel.body?.description ?? "", COMMANDS_HEADING)?.section ?? "";
  // Fork: the runner acts on the answer without asking again, so the list is shown once more
  // before anything is written. Cancel is the dialog's default, so a stray click or Enter does nothing.
  const confirm = () =>
    repo.confirm({
      title: "Approve commands",
      message:
        (except.trim()
          ? `The board runner will run these commands except ${except.trim()}:`
          : "The board runner will run all of these commands:") + `\n\n${commands}`,
      cta: except.trim() ? "Approve the others" : "Approve all",
    });
  const approve = async () => {
    if (!(await confirm())) return;
    await panel
      .mutate(async () => {
        // The runner reads a reply starting with `ok` as the approval, so the text keeps that start.
        await post(except.trim() ? `ok except ${except.trim()}` : "ok, approved all commands");
        const tags = withoutTag(card.frontmatter["tags"], FEEDBACK_TAG);
        if (tags) await repo.setFrontmatter(path, { tags });
      })
      .then((ok) => {
        if (!ok) return;
        if (panel.stillHere()) setExcept("");
        const next = queueNeighbours(queue, path)?.next;
        if (next && queue) actions.open(next, queue.tabOf(next));
      });
  };
  return (
    <div className="folia-commands-approval folia-add-inline folia-row-actions">
      <input
        value={except}
        placeholder="Except (e.g. 3)"
        aria-label="Commands not approved"
        onChange={(e) => setExcept(e.target.value)}
      />
      <HostButton
        className="folia-btn"
        text={except.trim() ? "Approve the others" : "Approve commands"}
        cta
        onClick={() => void approve()}
      />
    </div>
  );
}
