import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/ui/App";
import { FakeRepo } from "./fakeRepo";
import { testHost } from "./fakeHost";
import type { BoardConfig } from "../src/model/types";
import { DEFAULT_BOARD_SETTINGS as DEFAULT_SETTINGS } from "./boardSettings";

const config: BoardConfig = {
  path: "Board.md",
  cardFolder: "Tasks",
  titleMode: "auto",
  priorities: [],
  relations: [],
  columns: [{ id: "doing", title: "Doing" }],
};

// jsdom's File has no arrayBuffer(); Obsidian's Chromium does.
const file = (type: string) => ({ type, arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) });
const paste = (el: HTMLElement, files: object[]) =>
  fireEvent.paste(el, { clipboardData: { files, getData: () => "" } });

describe("pasting an image into a card textarea", () => {
  it("saves the image and inserts its embed at the cursor; text pastes as usual", async () => {
    const repo = new FakeRepo(config, {
      "Tasks/Shot.md": { fm: { status: "doing" }, body: "\n# Shot\n\n## Subtasks\n" },
    });
    render(
      <App
        repo={repo}
        settings={DEFAULT_SETTINGS}
        onUpdateSettings={() => {}}
        today="2026-06-13"
        host={testHost()}
      />,
    );
    await userEvent.click(await screen.findByText("Shot", { selector: ".folia-card-title" }));
    const detail = await screen.findByTestId("card-detail");
    await userEvent.click(within(detail).getByRole("button", { name: /^Comments/ }));
    const box = await within(detail).findByLabelText<HTMLTextAreaElement>("Write a comment");
    await userEvent.type(box, "See ");
    paste(box, [file("image/png")]);
    await waitFor(() => expect(box.value).toBe("See ![[Pasted image 1.png]]"));
    expect(repo.attachments.has("Pasted image 1.png")).toBe(true);
    // A paste without an image is left to the browser.
    paste(box, [file("text/plain")]);
    expect(repo.attachments.size).toBe(1);
  });
});
