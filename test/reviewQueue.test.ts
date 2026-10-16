import { describe, expect, it } from "vitest";
import type { Board } from "../src/model/types";
import { queueCandidates } from "../src/ui/ReviewQueue";

const board = (cards: Record<string, Record<string, unknown>>) =>
  ({
    cards: Object.fromEntries(
      Object.entries(cards).map(([path, frontmatter]) => [path, { path, frontmatter }]),
    ),
  }) as unknown as Board;

describe("queueCandidates", () => {
  it("leaves out cards due on a later day, keeps today's and overdue ones", () => {
    const b = board({
      "a.md": { status: "po-review" },
      "b.md": { status: "po-review", due: "2026-06-12" },
      "c.md": { status: "po-review", due: "2026-06-13" },
      "d.md": { status: "po-review", due: "2026-06-14" },
      "e.md": { status: "doing", owner: "claude", tags: ["feedback-needed"], due: "2026-07-01" },
    });
    expect(queueCandidates(b, "2026-06-13")).toEqual(["a.md", "b.md", "c.md"]);
  });
});
