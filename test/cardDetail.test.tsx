import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/ui/App";
import { FakeRepo } from "./fakeRepo";
import { testHost } from "./fakeHost";
import type { BoardConfig } from "../src/model/types";
import { DEFAULT_BOARD_SETTINGS as DEFAULT_SETTINGS } from "./boardSettings";
import { BLOCKS } from "../src/model/relationships";

const config: BoardConfig = {
  path: "Board.md",
  cardFolder: "Tasks",
  titleMode: "auto",
  priorities: [],
  relations: [BLOCKS],
  columns: [
    { id: "todo", title: "Todo" },
    { id: "doing", title: "Doing" },
    { id: "done", title: "Done" },
  ],
};

const makeRepo = () =>
  new FakeRepo(config, {
    "Tasks/Alpha.md": {
      fm: { type: "task", status: "todo" },
      body: "\n# Alpha\n\n## History\n- _2026-06-12 08:00:_ Created\n",
    },
    "Tasks/Bare.md": { fm: { type: "task", status: "doing" }, body: "\n" },
  });

const renderApp = (repo: FakeRepo, settings = DEFAULT_SETTINGS) =>
  render(
    <App
      repo={repo}
      settings={settings}
      onUpdateSettings={() => {}}
      today="2026-06-13"
      host={testHost()}
    />,
  );

describe("CardDetail", () => {
  it("keeps the panel's own elements when the create form hands over to its card", async () => {
    const user = userEvent.setup();
    renderApp(makeRepo(), { ...DEFAULT_SETTINGS, addCardFlow: "detail" });
    await screen.findByText("Alpha");
    await user.click(screen.getAllByLabelText(/^Add card/)[0]!);
    const input = await screen.findByLabelText("New card title");
    const panel = screen.getByTestId("card-detail");
    const scroller = panel.querySelector(".folia-detail-scroll");
    await user.type(input, "Fresh{Enter}");
    await screen.findByRole("dialog", { name: "Fresh" });
    const after = screen.getByTestId("card-detail");
    expect(after).toBe(panel);
    expect(after.querySelector(".folia-detail-scroll")).toBe(scroller);
  });

  it("says each list is empty, and shows the history it has", async () => {
    const user = userEvent.setup();
    renderApp(makeRepo());
    await user.click(await screen.findByText("Bare", { selector: ".folia-card-title" }));
    const bare = await screen.findByTestId("card-detail");
    for (const text of [
      "No todos yet.",
      "Nothing linked yet.",
      "Nothing links here.",
      "No comments yet.",
      "No history yet.",
    ]) {
      expect(await within(bare).findByText(text)).toBeInTheDocument();
    }
    await user.click(screen.getByText("Alpha", { selector: ".folia-card-title" }));
    const alpha = await screen.findByRole("dialog", { name: "Alpha" });
    const history = (await within(alpha).findByText("Created")).closest("li") as HTMLElement;
    expect(within(history).getByText("2026-06-12 08:00")).toHaveClass("folia-ts");
  });

  it("opens a clamped display title in full, and closes it again", async () => {
    const user = userEvent.setup();
    renderApp(makeRepo());
    await user.click(await screen.findByText("Alpha", { selector: ".folia-card-title" }));
    const detail = await screen.findByTestId("card-detail");
    const title = within(detail).getByRole("button", { name: "Show the whole title" });
    expect(title).toHaveAttribute("aria-expanded", "false");
    await user.click(title);
    expect(title).toHaveAttribute("aria-expanded", "true");
    expect(title).toHaveAccessibleName("Show less of the title");
    expect(title).toHaveClass("folia-is-expanded");
    await user.click(title);
    expect(title).toHaveAttribute("aria-expanded", "false");
  });

  it("walks the title rules step by step behind “Why this title?”", async () => {
    const user = userEvent.setup();
    renderApp(makeRepo());
    await user.click(await screen.findByText("Alpha", { selector: ".folia-card-title" }));
    const detail = await screen.findByTestId("card-detail");
    await within(detail).findByText("Created");
    const why = within(detail).getByRole("button", { name: "Why this title?" });
    await user.click(why);
    expect(why).toHaveAttribute("aria-expanded", "true");
    const steps = [...detail.querySelectorAll(".folia-title-step")];
    expect(steps.length).toBeGreaterThan(1);
    expect(detail.querySelectorAll(".folia-title-step.folia-is-winner")).toHaveLength(1);
    expect(steps.map((s) => s.querySelector(".folia-title-step-value")?.textContent)).toContain(
      "not set",
    );
    await user.click(why);
    expect(detail.querySelector(".folia-title-trace")).toBeNull();
  });
});

describe("fork: the panel steps through its column", () => {
  const stepRepo = (extra: Partial<BoardConfig> = {}) =>
    new FakeRepo(
      { ...config, ...extra },
      {
        "Tasks/Alpha.md": { fm: { status: "todo", owner: "you" }, body: "\n" },
        "Tasks/Beta.md": { fm: { status: "todo", owner: "claude" }, body: "\n" },
        "Tasks/Delta.md": { fm: { status: "todo", owner: "you" }, body: "\n" },
        "Tasks/Other.md": { fm: { status: "doing", owner: "you" }, body: "\n" },
      },
    );
  const open = async (title: string) => {
    await userEvent.click(await screen.findByText(title, { selector: ".folia-card-title" }));
    return screen.findByRole("dialog", { name: title });
  };
  const prev = (d: HTMLElement) => within(d).getByLabelText(/^Previous card in column/);
  const next = (d: HTMLElement) => within(d).getByLabelText(/^Next card in column/);

  it("opens the card above or below, switched off at the ends, and keeps the tab", async () => {
    const user = userEvent.setup();
    renderApp(stepRepo());
    let detail = await open("Alpha");
    expect(prev(detail)).toHaveAttribute("aria-disabled", "true");
    await user.click(within(detail).getByRole("button", { name: "Comments" }));
    await user.click(next(detail));
    detail = await screen.findByRole("dialog", { name: "Beta" });
    const comments = detail.querySelectorAll<HTMLElement>(".folia-tab-pane")[1]!;
    expect(comments.hidden).toBe(false);
    await user.click(next(detail));
    detail = await screen.findByRole("dialog", { name: "Delta" });
    // Other sits in another column: Delta is the last of its own.
    expect(next(detail)).toHaveAttribute("aria-disabled", "true");
    await user.click(prev(detail));
    await screen.findByRole("dialog", { name: "Beta" });
  });

  it("steps on Alt+Up / Alt+Down, over what the search leaves on the board", async () => {
    const user = userEvent.setup();
    renderApp(stepRepo());
    // Only Alpha and Delta have an "l": Beta between them is not on the board.
    await user.type(await screen.findByLabelText("Search cards"), "l");
    const detail = await open("Alpha");
    fireEvent.keyDown(within(detail).getByRole("heading", { name: "Alpha" }), {
      key: "ArrowDown",
      altKey: true,
    });
    const delta = await screen.findByRole("dialog", { name: "Delta" });
    fireEvent.keyDown(delta, { key: "ArrowUp", altKey: true });
    await screen.findByRole("dialog", { name: "Alpha" });
  });

  it("stays in the card's own lane on a board with lanes", async () => {
    const user = userEvent.setup();
    renderApp(stepRepo({ swimlanes: "owner" }));
    const detail = await open("Alpha");
    // Beta is in the claude lane, so the next card in Alpha's lane is Delta.
    fireEvent.keyDown(detail, { key: "ArrowDown", altKey: true });
    const gamma = await screen.findByRole("dialog", { name: "Delta" });
    expect(next(gamma)).toHaveAttribute("aria-disabled", "true");
    await user.click(prev(gamma));
    await screen.findByRole("dialog", { name: "Alpha" });
  });
});

describe("fork: copy the description", () => {
  it("puts the Markdown as written on the clipboard and says so", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const saved = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      const repo = new FakeRepo(config, {
        "Tasks/Alpha.md": { fm: { status: "todo" }, body: "\n# Alpha\n\nSome **bold** text\n" },
      });
      renderApp(repo);
      await userEvent.click(await screen.findByText("Alpha", { selector: ".folia-card-title" }));
      const detail = await screen.findByTestId("card-detail");
      // fireEvent, not userEvent: `userEvent.setup()` installs a clipboard stub of its own.
      fireEvent.click(await within(detail).findByLabelText("Copy description"));
      expect(writeText).toHaveBeenCalledWith("Some **bold** text");
      await waitFor(() =>
        expect(repo.notices).toContainEqual({ message: "Description copied", tone: "success" }),
      );
    } finally {
      if (saved) Object.defineProperty(navigator, "clipboard", saved);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("fork: quick reply on the Comments tab", () => {
  it("keeps Enter for a new line, sends on Ctrl+Enter in the usual comment line", async () => {
    const user = userEvent.setup();
    const repo = makeRepo();
    repo.getUserName = () => "chris";
    renderApp(repo);
    await user.click(await screen.findByText("Alpha", { selector: ".folia-card-title" }));
    const detail = await screen.findByTestId("card-detail");
    const input = within(detail).getByLabelText("Write a comment");
    await user.type(input, "first line{Enter}second line");
    expect(input).toHaveValue("first line\nsecond line");
    expect(repo.files.get("Tasks/Alpha.md")!.body).not.toContain("first line");
    await user.type(input, "{Control>}{Enter}{/Control}");
    await waitFor(() =>
      expect(repo.files.get("Tasks/Alpha.md")!.body).toContain(
        "- _2026-06-13 12:00 @chris:_ first line\n  second line",
      ),
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("sends with the Send button, which is off while the box is empty (a phone has no Ctrl)", async () => {
    const user = userEvent.setup();
    const repo = makeRepo();
    repo.getUserName = () => "chris";
    renderApp(repo);
    await user.click(await screen.findByText("Alpha", { selector: ".folia-card-title" }));
    const detail = await screen.findByTestId("card-detail");
    await user.click(within(detail).getByRole("button", { name: /^Comments/ }));
    const button = within(detail).getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();
    await user.type(within(detail).getByLabelText("Write a comment"), "from the phone");
    await user.click(button);
    await waitFor(() =>
      expect(repo.files.get("Tasks/Alpha.md")!.body).toContain(
        "- _2026-06-13 12:00 @chris:_ from the phone",
      ),
    );
  });

  it("focuses the reply box when the comment badge opens the card", async () => {
    const user = userEvent.setup();
    renderApp(
      new FakeRepo(config, {
        "Tasks/Alpha.md": {
          fm: { status: "todo" },
          body: "\n# Alpha\n\n## Comments\n- _2026-06-12 08:00:_ hi there\n",
        },
      }),
    );
    const tile = (await screen.findByText("Alpha")).closest<HTMLElement>(".folia-card")!;
    await user.click(tile.querySelector<HTMLElement>(".folia-card-comments")!);
    const detail = await screen.findByTestId("card-detail");
    await waitFor(() => expect(within(detail).getByLabelText("Write a comment")).toHaveFocus());
  });
});
