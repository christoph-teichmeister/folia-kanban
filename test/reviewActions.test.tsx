import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/ui/App";
import { splitSection, withoutTag } from "../src/ui/ReviewActions";
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
