// The dialog the card detail panel is drawn in: Obsidian's own `Modal`, so the backdrop, the focus
// trap, Escape, the close button and focus restore are the app's. The panel itself is portalled
// into `contentEl` by the board; nothing here knows what it shows.

import { Modal, Scope, type App } from "obsidian";
import type { DetailModalHandle } from "../ui/App";

class DetailModal extends Modal {
  private closed = false;

  constructor(
    app: App,
    private onClosed: () => void,
  ) {
    super(app);
    this.modalEl.addClass("folia-detail-modal");
    // The portal leaves the board root, and every `--folia-*` token hangs off `folia-scope`.
    this.contentEl.addClass("folia-scope", "folia-detail-modal-content");
  }

  /**
   * Escape, the backdrop, the close button and a closing pop-out window all end here, and the
   * inherited close removes the DOM before `onClose` runs. A field commits on blur, so the focused
   * one is blurred first, while it is still in the document: otherwise a half-typed value is lost.
   * The board closes the dialog too when the panel goes away, which can come right after the
   * dialog closed itself, so a second call does nothing.
   */
  override close(): void {
    if (this.closed) return;
    this.closed = true;
    const focused = this.contentEl.doc.activeElement;
    if (
      focused?.instanceOf(HTMLElement) &&
      this.contentEl.contains(focused) &&
      (focused.tagName === "INPUT" || focused.tagName === "TEXTAREA")
    )
      focused.blur();
    super.close();
  }

  override onClose(): void {
    this.onClosed();
  }

  /**
   * A child of the dialog's own scope, so while it is pushed Escape reaches `handler` and not the
   * dialog, and every other key still resolves through the dialog and the app.
   */
  pushEscape(handler: () => void): () => void {
    const scope = new Scope(this.scope);
    scope.register([], "Escape", () => {
      handler();
      return false;
    });
    this.app.keymap.pushScope(scope);
    let popped = false;
    return () => {
      if (popped) return;
      popped = true;
      this.app.keymap.popScope(scope);
    };
  }
}

/** Open the detail panel's dialog on the active window. `onClosed` runs however it was closed. */
export function openDetailModal(app: App, onClosed: () => void): DetailModalHandle {
  const modal = new DetailModal(app, onClosed);
  modal.open();
  return {
    contentEl: modal.contentEl,
    close: () => modal.close(),
    pushEscape: (handler) => modal.pushEscape(handler),
  };
}
