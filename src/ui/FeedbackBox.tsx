// Fork addition: the top of a card Claude has asked a question on (tag `feedback-needed`): the
// question, then a way to answer it. An answer is an ordinary comment, and it drops the tag, the way
// "Approve commands" does. In a running review queue it moves on to the next card. A card with a
// `## Commands to approve` section is approved there instead of with Yes/No; a written answer
// still goes. "Send back" is the way
// out when the question itself is unclear: the note goes back marked as a counter-question, so
// Claude asks again instead of acting on it.
import { useContext, useState } from "react";
import type { Card } from "../model/types";
import { useBoardActions, useRepo } from "./context";
import { DetailDialogContext } from "./detailDialog";
import { HostButton } from "./hostControls";
import { Markdown } from "./Markdown";
import { queueNeighbours, ReviewQueueContext } from "./ReviewQueue";
import {
  COMMANDS_HEADING,
  CommandsApproval,
  FEEDBACK_TAG,
  SnoozeButton,
  splitSection,
  usePostComment,
  withoutTag,
} from "./ReviewActions";
import type { CardPanelState } from "./useCardPanel";
import { usePasteImage } from "./usePasteImage";

/** How a sent-back note starts, so Claude (and the board runner) read it as a counter-question. */
const SENT_BACK = "Sent back, unclear:";

interface Props {
  path: string;
  card: Card;
  panel: CardPanelState;
}

export function FeedbackBox(props: Props) {
  const { card, panel } = props;
  const body = panel.body;
  if (!body || withoutTag(card.frontmatter["tags"], FEEDBACK_TAG) === null) return null;
  const commands = splitSection(body.description, COMMANDS_HEADING) !== null;
  // The question is Claude's latest comment; a card with none yet shows the box without it.
  const asked =
    [...body.comments].reverse().find((c) => c.author?.toLowerCase() === "claude") ??
    body.comments[body.comments.length - 1];
  const ask = card.frontmatter["ask"];
  return (
    <FeedbackForm
      {...props}
      ask={typeof ask === "string" ? ask.trim() : ""}
      question={asked?.text ?? ""}
      commands={commands}
    />
  );
}

function FeedbackForm({
  path,
  card,
  panel,
  ask,
  question,
  commands,
}: Props & { ask: string; question: string; commands: boolean }) {
  const repo = useRepo();
  const actions = useBoardActions();
  const queue = useContext(ReviewQueueContext);
  const dialog = useContext(DetailDialogContext);
  const post = usePostComment(path, panel);
  const [note, setNote] = useState("");
  const onPaste = usePasteImage(path, setNote);
  const answer = (text: string) => {
    const next = queueNeighbours(queue, path)?.next ?? null;
    void panel
      .mutate(async () => {
        await post(text);
        const tags = withoutTag(card.frontmatter["tags"], FEEDBACK_TAG);
        if (tags) await repo.setFrontmatter(path, { tags });
        await repo.unsetFrontmatterKey(path, "ask");
      })
      .then((ok) => {
        if (!ok) return;
        if (panel.stillHere()) setNote("");
        if (next && queue) actions.open(next, queue.tabOf(next));
      });
  };
  return (
    <section className="folia-review folia-feedback" aria-label="Feedback needed">
      <h3>Feedback needed</h3>
      {/* `ask` is Claude's one-or-two-sentence summary of what it needs; the comment behind it is
          the full story, folded away while there is a summary. */}
      {ask && <p className="folia-feedback-ask">{ask}</p>}
      {question && (
        <details className="folia-feedback-full" open={!ask}>
          {ask && <summary>Full comment</summary>}
          <Markdown
            markdown={question}
            sourcePath={path}
            className="folia-review-text"
            onFollowLink={() => dialog?.close()}
          />
        </details>
      )}
      {commands && <CommandsApproval path={path} card={card} panel={panel} />}
      <div className="folia-add-inline">
        <textarea
          value={note}
          placeholder="Your answer, or what is unclear"
          aria-label="Your answer"
          onChange={(e) => setNote(e.target.value)}
          onPaste={onPaste}
        />
      </div>
      <AnswerButtons path={path} panel={panel} note={note} commands={commands} answer={answer} />
    </section>
  );
}

/** Send answer / Yes / No, then Send back and Tomorrow. */
function AnswerButtons({
  path,
  panel,
  note,
  commands,
  answer,
}: Pick<Props, "path" | "panel"> & {
  note: string;
  commands: boolean;
  answer: (text: string) => void;
}) {
  return (
    <div className="folia-row-actions">
      <HostButton
        className="folia-btn"
        text="Send answer"
        cta={!commands}
        disabled={!note.trim()}
        onClick={() => note.trim() && answer(note.trim())}
      />
      {/* With commands waiting, the runner reads a reply starting with "yes" as their approval,
            so the one-click answers are left out there. */}
      {!commands && (
        <>
          <HostButton className="folia-btn" text="Yes" onClick={() => answer("Yes.")} />
          <HostButton className="folia-btn" text="No" onClick={() => answer("No.")} />
        </>
      )}
      <HostButton
        className="folia-btn"
        text="Send back"
        disabled={!note.trim()}
        onClick={() => note.trim() && answer(`${SENT_BACK} ${note.trim()}`)}
      />
      <SnoozeButton path={path} panel={panel} />
    </div>
  );
}
