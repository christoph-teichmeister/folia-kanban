import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/ui/App";
import { splitSection, withoutTag } from "../src/ui/ReviewActions";
import { dateOnly, nextDay } from "../src/model/dates";
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
  columns: [
    { id: "doing", title: "Doing" },
    { id: "po-review", title: "PO review" },
    { id: "done", title: "Done" },
  ],
};

const REVIEW_BODY =
  "\n# Review me\n\nIntro text.\n\n## For PO Review\nCheck the build log.\n\n## Subtasks\n- [x] build\n";
const COMMANDS_BODY =
  "\n# Run it\n\nNeeds sudo.\n\n## Commands to approve\n1. `sudo systemctl restart x`: restarts x\n\n## Subtasks\n";

const makeRepo = () =>
  new FakeRepo(config, {
    "Tasks/Review me.md": { fm: { status: "po-review" }, body: REVIEW_BODY },
    "Tasks/Run it.md": {
      fm: { status: "doing", tags: ["setup", "feedback-needed"] },
      body: COMMANDS_BODY,
    },
  });

let repo: FakeRepo;

const open = async (title: string) => {
  render(
    <App
      repo={repo}
      settings={DEFAULT_SETTINGS}
      onUpdateSettings={() => {}}
      today="2026-06-13"
      host={testHost()}
    />,
  );
  await userEvent.click(await screen.findByText(title, { selector: ".folia-card-title" }));
  return screen.findByTestId("card-detail");
};
describe("splitSection", () => {
  it("cuts a level-two section out up to the next heading, ignoring fenced headings", () => {
    const d = "Intro\n\n## For PO Review\nCheck\n```\n## not a heading\n```\n## Next\nRest";
    expect(splitSection(d, "for po review")).toEqual({
      section: "Check\n```\n## not a heading\n```",
      rest: "Intro\n\n## Next\nRest",
    });
    expect(splitSection("Intro", "For PO Review")).toBeNull();
  });

  it("drops one tag from frontmatter tags, or says it is not there", () => {
    expect(withoutTag(["a", "feedback-needed"], "feedback-needed")).toEqual(["a"]);
    expect(withoutTag("feedback-needed", "feedback-needed")).toEqual([]);
    expect(withoutTag(["a"], "feedback-needed")).toBeNull();
  });
});

describe("PO review in the card panel", () => {
  it("shows the For PO Review section first, once, and approves to done with a comment", async () => {
    repo = makeRepo();
    const detail = await open("Review me");
    const box = within(detail).getByRole("region", { name: "PO review" });
    await waitFor(() => expect(box).toHaveTextContent("Check the build log."));
    const desc = detail.querySelector(".folia-desc-rendered")!;
    expect(desc).toHaveTextContent("Intro text.");
    expect(desc).not.toHaveTextContent("Check the build log.");
    expect(within(box).getByRole("button", { name: "Send back" })).toBeDisabled();
    await userEvent.click(within(box).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(repo.files.get("Tasks/Review me.md")!.fm.status).toBe("done"));
    expect(repo.files.get("Tasks/Review me.md")!.body).toMatch(/## Comments\n- _.*_ Approved\./);
    // The file itself is never rewritten for the display.
    expect(repo.files.get("Tasks/Review me.md")!.body).toContain("## For PO Review");
  });

  it("sends a card back to doing with the required note as the comment", async () => {
    repo = makeRepo();
    const detail = await open("Review me");
    const box = within(detail).getByRole("region", { name: "PO review" });
    await userEvent.type(within(box).getByLabelText("Review note"), "Log is missing");
    await userEvent.click(within(box).getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(repo.files.get("Tasks/Review me.md")!.fm.status).toBe("doing"));
    expect(repo.files.get("Tasks/Review me.md")!.body).toContain("Log is missing");
  });

  it("opens the next card in review after approving or sending back", async () => {
    repo = new FakeRepo(config, {
      "Tasks/Review me.md": { fm: { status: "po-review", order: 1 }, body: REVIEW_BODY },
      "Tasks/Review too.md": {
        fm: { status: "po-review", order: 2 },
        body: "\n# Review too\n\n## For PO Review\nSecond one.\n\n## Subtasks\n",
      },
    });
    const detail = await open("Review me");
    await userEvent.click(within(detail).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(repo.files.get("Tasks/Review me.md")!.fm.status).toBe("done"));
    const next = await screen.findByTestId("card-detail");
    await waitFor(() => expect(next).toHaveTextContent("Second one."));
    // Last card in the column: nothing left to open, the panel stays on it.
    await userEvent.type(within(next).getByLabelText("Review note"), "Redo");
    await userEvent.click(within(next).getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(repo.files.get("Tasks/Review too.md")!.fm.status).toBe("doing"));
  });

  it("walks the review queue: skip with next, answer with Send & next", async () => {
    const asked = (t: string) => ({
      fm: { status: "doing", owner: "claude", tags: ["setup", "feedback-needed"] },
      body: `\n# ${t}\n\nQuestion?\n\n## Subtasks\n`,
    });
    repo = new FakeRepo(config, {
      "Tasks/Review me.md": { fm: { status: "po-review" }, body: REVIEW_BODY },
      "Tasks/Ask one.md": asked("Ask one"),
      "Tasks/Ask two.md": asked("Ask two"),
      // Due on a later day: left out until that day.
      "Tasks/Later.md": { fm: { status: "po-review", due: "2026-06-20" }, body: REVIEW_BODY },
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
    await userEvent.click(await screen.findByRole("button", { name: /Review queue \(3\)/ }));
    let detail = await screen.findByTestId("card-detail");
    await waitFor(() => expect(detail).toHaveTextContent("Check the build log."));
    // Skipping a card changes nothing and lands on the next one, on its Comments tab.
    await userEvent.click(within(detail).getByRole("button", { name: /Next in review queue/ }));
    await waitFor(() => expect(screen.getByTestId("card-detail")).toHaveTextContent("Ask one"));
    expect(repo.files.get("Tasks/Review me.md")!.fm.status).toBe("po-review");
    detail = screen.getByTestId("card-detail");
    await userEvent.type(await within(detail).findByLabelText("Write a comment"), "Yes, go");
    await userEvent.click(within(detail).getByRole("button", { name: "Send & next" }));
    await waitFor(() => expect(repo.files.get("Tasks/Ask one.md")!.body).toContain("Yes, go"));
    await waitFor(() => expect(screen.getByTestId("card-detail")).toHaveTextContent("Ask two"));
    // The last card of the queue has nothing to move on to.
    expect(screen.queryByRole("button", { name: "Send & next" })).toBeNull();
  });

  it("answers a question from the Feedback needed box and drops the tag", async () => {
    repo = new FakeRepo(config, {
      "Tasks/Ask me.md": {
        fm: {
          status: "doing",
          owner: "claude",
          ask: "Delete the old copy?",
          tags: ["setup", "feedback-needed"],
        },
        body: "\n# Ask me\n\n## Subtasks\n\n## Comments\n- _2026-06-12 09:00 @claude:_ Shall I delete the old copy?\n",
      },
    });
    const detail = await open("Ask me");
    const box = within(detail).getByRole("region", { name: "Feedback needed" });
    await waitFor(() => expect(box).toHaveTextContent("Delete the old copy?"));
    expect(box).toHaveTextContent("Full comment");
    await userEvent.click(within(box).getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(repo.files.get("Tasks/Ask me.md")!.fm["tags"]).toEqual(["setup"]));
    expect(repo.files.get("Tasks/Ask me.md")!.fm["ask"]).toBeUndefined();
    expect(repo.files.get("Tasks/Ask me.md")!.body).toMatch(/_ Yes\.\n?/);
  });

  it("sends an unclear question back, or snoozes it to tomorrow", async () => {
    repo = new FakeRepo(config, {
      "Tasks/Ask me.md": {
        fm: { status: "doing", owner: "claude", tags: ["setup", "feedback-needed"] },
        body: "\n# Ask me\n\n## Subtasks\n\n## Comments\n- _2026-06-12 09:00 @claude:_ Run the two commands?\n",
      },
    });
    const detail = await open("Ask me");
    const box = within(detail).getByRole("region", { name: "Feedback needed" });
    await userEvent.click(within(box).getByRole("button", { name: "Snooze until tomorrow" }));
    await waitFor(() =>
      expect(repo.files.get("Tasks/Ask me.md")!.fm["snoozed-until"]).toBe(nextDay(dateOnly())),
    );
    expect(repo.files.get("Tasks/Ask me.md")!.fm["tags"]).toContain("feedback-needed");
    await userEvent.type(within(box).getByLabelText("Your answer"), "Which commands?");
    await userEvent.click(within(box).getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(repo.files.get("Tasks/Ask me.md")!.fm["tags"]).toEqual(["setup"]));
    expect(repo.files.get("Tasks/Ask me.md")!.body).toMatch(
      /_ Sent back, unclear: Which commands\?/,
    );
  });

  it("approves commands with an ok comment and drops feedback-needed", async () => {
    repo = makeRepo();
    const detail = await open("Run it");
    expect(within(detail).queryByRole("region", { name: "PO review" })).toBeNull();
    // Cancelled: nothing is written.
    repo.answerConfirm = () => false;
    await userEvent.click(await within(detail).findByRole("button", { name: "Approve commands" }));
    expect(repo.confirms.at(-1)?.message).toContain("run all of these commands");
    expect(repo.confirms.at(-1)?.message).toContain("sudo systemctl restart x");
    expect(repo.files.get("Tasks/Run it.md")!.body).not.toMatch(/approved all commands/);
    expect(repo.files.get("Tasks/Run it.md")!.fm["tags"]).toContain("feedback-needed");
    // Confirmed: the ok comment is written and the tag dropped.
    repo.answerConfirm = () => true;
    await userEvent.click(within(detail).getByRole("button", { name: "Approve commands" }));
    await waitFor(() => expect(repo.files.get("Tasks/Run it.md")!.fm["tags"]).toEqual(["setup"]));
    expect(repo.files.get("Tasks/Run it.md")!.body).toMatch(/_ ok, approved all commands\n/);
  });
});
