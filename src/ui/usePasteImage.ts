import type { ClipboardEvent } from "react";
import { useRepo } from "./context";

/**
 * Fork: paste an image from the clipboard into a card textarea. The image is saved as an attachment
 * of the card note and its embed is inserted where the cursor was; anything else pastes as usual.
 */
export function usePasteImage(sourcePath: string, setValue: (value: string) => void) {
  const repo = useRepo();
  return (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const extension = file.type.slice("image/".length).replace("jpeg", "jpg");
    void file
      .arrayBuffer()
      .then((data) => repo.saveAttachment(data, extension, sourcePath))
      .then((embed) => setValue(el.value.slice(0, start) + embed + el.value.slice(end)));
  };
}
