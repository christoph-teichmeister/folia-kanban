import { useEffect, useRef, type MouseEvent } from "react";
import { useRepo } from "./context";

interface Props {
  markdown: string;
  /** The note path — resolves internal links/embeds relative to it. */
  sourcePath: string;
  className?: string;
  /** Runs when a click on a rendered link is about to open its note. */
  onFollowLink?: () => void;
}

/**
 * Renders markdown through the repo's engine (Obsidian's MarkdownRenderer in the vault, plain text
 * in tests). The effect registers the repo's cleanup synchronously, so the managed Component is
 * always unloaded on unmount or when the markdown/path changes — no leaked Components.
 *
 * The container carries Obsidian's own "markdown-rendered" class. Community themes and CSS
 * snippets scope their reading-view prose rules to that class, not to the raw HTML tags — without
 * it, MarkdownRenderer.render still calls the right API but the output falls back to Folia's own
 * (theme-blind) styling instead of the active theme's.
 */
export function Markdown({ markdown, sourcePath, className, onFollowLink }: Props) {
  const repo = useRepo();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    return repo.renderMarkdown(ref.current, markdown, sourcePath);
  }, [repo, markdown, sourcePath]);
  const follow = (e: MouseEvent) => repo.followLink(e.nativeEvent, sourcePath, onFollowLink);
  const classes = className ? `markdown-rendered ${className}` : "markdown-rendered";
  return (
    // a11y exception (no-static-element-interactions, click-events-have-key-events): delegated from the rendered links, which are focusable anchors; Enter on one fires the click handled here
    <div
      ref={ref}
      className={classes}
      onClick={follow}
      onAuxClick={(e) => {
        if (e.button === 1) follow(e);
      }}
    />
  );
}
