import { useContext, useState, type Ref } from "react";
import type { CardBody } from "../model/types";
import { useRepo, useSettings } from "./context";
import { DetailDialogContext } from "./detailDialog";
import { HostButton, HostIconButton } from "./hostControls";
import { Markdown } from "./Markdown";
import type { CommentReadState } from "./useCommentReadState";
import type { InlineDraft } from "./useInlineDraft";

/** Fork: a comment longer than this starts clamped, with "Show more". ponytail: a length guess, not a measurement. */
const CLAMP_OVER = 360;
/** Fork: with more comments than this, only the newest `KEEP_VISIBLE` show until "Show earlier" is pressed. */
const COLLAPSE_OVER = 4;
const KEEP_VISIBLE = 3;

/** Fork: "2026-10-13 12:15" as "13 Oct 2026, 12:15"; anything else is shown as written. */
export function commentDate(timestamp: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(timestamp);
  if (!m) return timestamp;
  const [, y, mo, d, h, mi] = m;
  const day = new Date(Number(y), Number(mo) - 1, Number(d));
  const date = day.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return h ? `${date}, ${h}:${mi}` : date;
}

/** Fork: who a comment is from. Unsigned comments are the person using the board. */
export function commentWho(
  author: string | null,
  me: string,
): { name: string; handle: string | null } {
  if (!author) return { name: me || "You", handle: null };
  return { name: author.charAt(0).toUpperCase() + author.slice(1), handle: author };
}

/** The rendered comment; a long one starts clamped behind "Show more". */
function ClampedMarkdown({
  text,
  sourcePath,
  onFollowLink,
}: {
  text: string;
  sourcePath: string;
  onFollowLink: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > CLAMP_OVER;
  return (
    <div className="folia-comment-main">
      <Markdown
        markdown={text}
        sourcePath={sourcePath}
        className={"folia-comment-text" + (long && !expanded ? " folia-is-clamped" : "")}
        onFollowLink={onFollowLink}
      />
      {long && (
        <HostButton
          className="folia-btn folia-comment-more"
          text={expanded ? "Show less" : "Show more"}
          onClick={() => setExpanded(!expanded)}
        />
      )}
    </div>
  );
}

/** Fork: the line above a comment: who wrote it, their handle, and when. */
function CommentHead({
  author,
  timestamp,
  unread,
}: {
  author: string | null;
  timestamp: string;
  unread: false | "unread" | "reply";
}) {
  const who = commentWho(author, useSettings().userName.trim());
  return (
    <div className="folia-comment-head">
      <span className="folia-comment-author">{who.name}</span>
      {who.handle && <span className="folia-comment-handle">@{who.handle}</span>}
      <span className="folia-ts">{commentDate(timestamp)}</span>
      {unread && <span className="folia-comment-flag">{unread === "reply" ? "reply" : "new"}</span>}
    </div>
  );
}

/** One comment with inline edit + delete. View mode renders the text as markdown; edit shows the
 *  raw textarea (commits on Enter/blur). Keeps the timestamp and the author signature untouched. */
function CommentItem({
  timestamp,
  author,
  unread,
  text,
  sourcePath,
  onSave,
  onDelete,
}: {
  timestamp: string;
  author: string | null;
  /** `false` = already seen; `"unread"`/`"reply"` = new since this card was last opened. */
  unread: false | "unread" | "reply";
  text: string;
  sourcePath: string;
  onSave: (v: string) => void;
  onDelete: () => void;
}) {
  const dialog = useContext(DetailDialogContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== text) onSave(draft.trim());
  };
  const who = commentWho(author, useSettings().userName.trim());
  return (
    <li
      className={"folia-comment" + (unread ? ` folia-comment-${unread}` : "")}
      data-author={author ?? ""}
    >
      <span className="folia-comment-avatar" aria-hidden="true">
        {who.name.charAt(0).toUpperCase()}
      </span>
      <div className="folia-comment-card">
        <CommentHead author={author} timestamp={timestamp} unread={unread} />
        {editing ? (
          <textarea
            className="folia-comment-edit"
            value={draft}
            autoFocus
            aria-label="Edit comment"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
            }}
          />
        ) : (
          <div className="folia-comment-row">
            <ClampedMarkdown
              text={text}
              sourcePath={sourcePath}
              onFollowLink={() => dialog?.close()}
            />
            <HostIconButton
              className="folia-detail-icon folia-mini"
              slotClassName="folia-detail-mini-slot"
              icon="pencil"
              label="Edit comment"
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
            />
            <HostIconButton
              className="folia-detail-icon folia-mini"
              slotClassName="folia-detail-mini-slot"
              icon="trash-2"
              label="Delete comment"
              onClick={onDelete}
            />
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * "reply" marks the comment that actually landed after one of yours, which need not be the first
 * unread one — an older unread comment can sit before it.
 */
function unreadMark(unread: CommentReadState["unread"], i: number): false | "unread" | "reply" {
  if (!unread.indices.includes(i)) return false;
  return unread.replyIndex === i ? "reply" : "unread";
}

interface CommentsProps {
  body: CardBody | null;
  path: string;
  readState: CommentReadState;
  draft: InlineDraft;
  mutate: (fn: () => Promise<unknown>) => Promise<boolean>;
  stillHere: () => boolean;
  /** Fork: the reply box, for the panel to focus when it opens on this tab. */
  inputRef?: Ref<HTMLTextAreaElement>;
}

/**
 * The box that adds a comment, on Ctrl/Cmd+Enter; Enter alone starts a new line. Fork: Enter used
 * to send; now a comment is sent with the keys the description editor saves with.
 */
function CommentComposer({
  body,
  path,
  readState,
  draft,
  mutate,
  stillHere,
  inputRef,
}: CommentsProps) {
  const repo = useRepo();
  return (
    <div className="folia-add-inline">
      <textarea
        ref={inputRef}
        value={draft.value}
        placeholder="Write a comment… (Ctrl+Enter sends)"
        aria-label="Write a comment"
        onChange={(e) => draft.setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && draft.value.trim()) {
            e.preventDefault();
            const text = draft.value.trim();
            const floor = body?.comments.length ?? 0;
            draft.send(text, () =>
              mutate(async () => {
                await repo.addComment(path, text);
                if (stillHere()) readState.posted({ floor, text });
              }),
            );
          }
        }}
      />
    </div>
  );
}

/** Fork: the row that folds the oldest comments away, or brings them back. */
function EarlierToggle({
  showAll,
  hidden,
  hiddenNew,
  onToggle,
}: {
  showAll: boolean;
  hidden: number;
  hiddenNew: number;
  onToggle: () => void;
}) {
  const newNote = hiddenNew ? ` (${hiddenNew} new)` : "";
  return (
    <li className="folia-comments-toggle">
      <HostButton
        className="folia-btn"
        text={showAll ? "Show only the newest" : `Show ${hidden} earlier comments${newNote}`}
        onClick={onToggle}
      />
    </li>
  );
}

/** The card's comments, the "New" divider before the first unread one, and the box that adds one. */
export function CardComments(props: CommentsProps) {
  const { body, path, readState, mutate } = props;
  const repo = useRepo();
  const { unread, commentKeys } = readState;
  const [showAll, setShowAll] = useState(false);
  const total = body?.comments.length ?? 0;
  const collapsible = total > COLLAPSE_OVER;
  const hidden = collapsible && !showAll ? total - KEEP_VISIBLE : 0;
  const hiddenNew = unread.indices.filter((i) => i < hidden).length;
  return (
    <section className="folia-section">
      <h3>Comments</h3>
      <ul className="folia-comments">
        {collapsible && (
          <EarlierToggle
            showAll={showAll}
            hidden={hidden}
            hiddenNew={hiddenNew}
            onToggle={() => setShowAll(!showAll)}
          />
        )}
        {body?.comments.flatMap((c, i) => {
          if (i < hidden) return [];
          // The divider is an extra <li> spliced in at the boundary, NOT a second list: `i`
          // stays the comment's own position, which is the edit/delete handle the model walks.
          const isFirstUnread = unread.indices[0] === i;
          // Keyed by the line itself, not its position: a reload after a comment is removed
          // above this one must keep an inline edit on the comment it was opened on. The text
          // is part of the key on purpose — a comment rewritten from elsewhere while its editor
          // is open is a different line, and the editor closes rather than write the old
          // wording back over it. Identical lines are told apart by which of them this one is.
          const key = commentKeys[i] ?? String(i);
          const item = (
            <CommentItem
              key={key}
              timestamp={c.timestamp}
              author={c.author}
              unread={unreadMark(unread, i)}
              text={c.text}
              sourcePath={path}
              onSave={(val) =>
                void mutate(async () => {
                  await repo.updateComment(path, { index: i, text: c.text }, val);
                  readState.edited(i, val);
                })
              }
              onDelete={() =>
                void mutate(async () => {
                  await repo.removeComment(path, { index: i, text: c.text });
                  readState.removed(i);
                })
              }
            />
          );
          return isFirstUnread
            ? [
                // A plain <li>: a `role="separator"` here would stop being a listitem and
                // break the <ul>'s list semantics (axe `list`). Hidden from assistive tech:
                // it would only add an item that says "New" and shift every count after it,
                // while each unread line already carries its own tag.
                <li key={`new-${key}`} className="folia-comments-divider" aria-hidden="true">
                  <span>New</span>
                </li>,
                item,
              ]
            : [item];
        })}
        {body && body.comments.length === 0 && <li className="folia-muted">No comments yet.</li>}
      </ul>
      <CommentComposer {...props} />
    </section>
  );
}
