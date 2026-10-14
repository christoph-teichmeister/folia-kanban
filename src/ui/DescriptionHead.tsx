import { useBoardActions } from "./context";
import { HostIconButton } from "./hostControls";

/**
 * Fork: the description's heading, with copy and edit in its row so they never cover the text.
 * `markdown` is the description as written, or null while it is being edited or is empty.
 */
export function DescriptionHead({
  markdown,
  onEdit,
}: {
  markdown: string | null;
  onEdit: () => void;
}) {
  const actions = useBoardActions();
  return (
    <div className="folia-section-head">
      <h3>Description</h3>
      {markdown != null && (
        <span className="folia-section-head-actions">
          {/* Copies the Markdown as written, not the rendered text. */}
          <HostIconButton
            className="folia-detail-icon folia-mini folia-desc-copy"
            icon="copy"
            label="Copy description"
            onClick={() => actions.copyText(markdown, "Description copied")}
          />
          <HostIconButton
            className="folia-detail-icon folia-mini folia-desc-edit"
            icon="pencil"
            label="Edit description"
            onClick={onEdit}
          />
        </span>
      )}
    </div>
  );
}
