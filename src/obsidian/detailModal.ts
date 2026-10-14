// The dialog the card detail panel is drawn in: Obsidian's own `Modal`, so the backdrop, the focus
// trap, Escape, the close button and focus restore are the app's. The panel itself is portalled
// into `contentEl` by the board; nothing here knows what it shows.

import { Modal, Scope, type App } from "obsidian";
import type { DetailModalHandle } from "../ui/App";

// Fork: the docked panel's width, dragged at its left edge, kept for this vault on this device.
const WIDTH_KEY = "folia-kanban.detail-width";
const MIN_WIDTH = 480;

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
    this.addResizeHandle();
  }

  /**
   * Only where the panel docks to the right edge (the `48rem` of `detail-panel.css`); a phone keeps
   * the host's full-screen dialog. Dragging sets the width inline, over the stylesheet's default; a
   * double click goes back to that default.
   */
  private addResizeHandle(): void {
    const win = this.modalEl.win;
    if (!win.matchMedia("(min-width: 48rem)").matches) return;
    const clamp = (px: number): number =>
      Math.round(Math.min(Math.max(px, MIN_WIDTH), win.innerWidth * 0.98));
    const saved: unknown = this.app.loadLocalStorage(WIDTH_KEY);
    if (typeof saved === "number") this.modalEl.setCssStyles({ width: `${clamp(saved)}px` });

    const handle = this.modalEl.createDiv({ cls: "folia-detail-resize" });
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", (down) => {
      down.preventDefault();
      handle.setPointerCapture(down.pointerId);
      this.modalEl.addClass("folia-is-resizing");
      let width = this.modalEl.getBoundingClientRect().width;
      const move = (e: PointerEvent): void => {
        width = clamp(win.innerWidth - e.clientX);
        this.modalEl.setCssStyles({ width: `${width}px` });
      };
      const up = (): void => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        this.modalEl.removeClass("folia-is-resizing");
        this.app.saveLocalStorage(WIDTH_KEY, width);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
    handle.addEventListener("dblclick", () => {
      this.modalEl.setCssStyles({ width: "" });
      this.app.saveLocalStorage(WIDTH_KEY, null);
    });
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
    // Fork: on a wide window the panel slides back out first (`.folia-is-closing`). Where nothing
    // animates (a phone, reduced motion, tests without the Web Animations API) it closes at once.
    this.modalEl.addClass("folia-is-closing");
    const sliding = this.modalEl.getAnimations?.() ?? [];
    if (sliding.length === 0) super.close();
    else this.modalEl.win.setTimeout(() => super.close(), 180);
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
