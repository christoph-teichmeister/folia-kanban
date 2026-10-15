// Fork addition: the top of a card Claude has asked a question on (tag `feedback-needed`): the
// question, then a way to answer it. An answer is an ordinary comment, and it drops the tag, the way
// "Approve commands" does. In a running review queue it moves on to the next card. A card with a
// `## Commands to approve` section is answered there instead: the box shows the question only.
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
  splitSection,
  usePostComment,
  withoutTag,
} from "./ReviewActions";
import type { CardPanelState } from "./useCardPanel";

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
  return <FeedbackForm {...props} question={asked?.text ?? ""} commands={commands} />;
}

function FeedbackForm({
  path,
  card,
  panel,
  question,
  commands,
}: Props & { question: string; commands: boolean }) {
  const repo = useRepo();
  const actions = useBoardActions();
  const queue = useContext(ReviewQueueContext);
  const dialog = useContext(DetailDialogContext);
  const post = usePostComment(path, panel);
  const [note, setNote] = useState("");
  const answer = (text: string) => {
    const next = queueNeighbours(queue, path)?.next ?? null;
    void panel
      .mutate(async () => {
        await post(text);
        const tags = withoutTag(card.frontmatter["tags"], FEEDBACK_TAG);
        if (tags) await repo.setFrontmatter(path, { tags });
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
      {commands ? (
        <CommandsApproval path={path} card={card} panel={panel} />
      ) : (
        <div className="folia-row-actions">
          <HostButton className="folia-btn" text="Yes" cta onClick={() => answer("Yes.")} />
          <HostButton className="folia-btn" text="No" onClick={() => answer("No.")} />
        </div>
      )}
      {question && (
        <Markdown
          markdown={question}
          sourcePath={path}
          className="folia-review-text"
          onFollowLink={() => dialog?.close()}
        />
      )}
      {!commands && (
        <>
          <div className="folia-add-inline">
            <textarea
              value={note}
              placeholder="Or write an answer"
              aria-label="Your answer"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="folia-row-actions">
            <HostButton
              className="folia-btn"
              text="Send answer"
              disabled={!note.trim()}
              onClick={() => note.trim() && answer(note.trim())}
            />
          </div>
        </>
      )}
    </section>
  );
}
