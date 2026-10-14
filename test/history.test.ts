import { describe, expect, it } from "vitest";
import { cardStats } from "../src/model/card";
import { daysInColumn } from "../src/model/history";

const waiting = { id: "waiting", title: "Waiting" };
const note = (...lines: string[]) =>
  `---\nstatus: waiting\n---\n# Card\n\n## History\n${lines.join("\n")}\n`;
const days = (text: string, today = "2026-10-14") =>
  daysInColumn(cardStats(text).lastMove, waiting, today);

describe("fork: days in the current column, from ## History", () => {
  it("counts whole days since the move into the column", () => {
    expect(days(note("- _2026-10-02 16:31:_ Moved from Next to Waiting"))).toBe(12);
    expect(days(note("- _2026-10-14 08:00:_ Moved from Next to Waiting"))).toBe(0);
  });

  it("reads the newest move and skips lines that leave the card where it is", () => {
    const text = note(
      "- _2026-09-01 09:00:_ Moved from Next to Waiting",
      "- _2026-09-20 09:00:_ Moved from Waiting to Doing",
      "- _2026-10-01 09:00:_ Moved from Doing to Waiting",
      "- _2026-10-05 09:00:_ Reordered within Waiting",
      '- _2026-10-06 09:00:_ Moved subtask "x" from Next to Doing',
      "- _2026-10-07 09:00:_ Comment added",
    );
    expect(days(text)).toBe(13);
  });

  it("accepts a status edit (column id) and the legacy bracketed timestamp", () => {
    expect(days(note("- _2026-10-04 10:00:_ Status → waiting"))).toBe(10);
    expect(days(note("- [2026-10-04 10:00] Moved from Next to Waiting"))).toBe(10);
  });

  it("says nothing without a move into this column", () => {
    expect(days(note("- _2026-10-01 09:00:_ Comment added"))).toBeNull();
    expect(days("# Card\n")).toBeNull();
    // The newest move went elsewhere: the card got here by a hand edit the history cannot date.
    expect(days(note("- _2026-10-01 09:00:_ Moved from Waiting to Doing"))).toBeNull();
  });
});
