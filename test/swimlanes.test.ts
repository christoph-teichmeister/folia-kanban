import { describe, it, expect } from "vitest";
import { laneModel, laneOfColumnId, plainColumnId } from "../src/model/swimlanes";
import type { Board, Card } from "../src/model/types";

const card = (path: string, owner?: unknown): Card =>
  ({ path, frontmatter: owner === undefined ? {} : { owner } }) as unknown as Card;

const board = {
  config: { columns: [{ id: "inbox" }, { id: "next" }, { id: "doing" }] },
  cards: {
    a: card("a", "claude"),
    b: card("b", "you"),
    c: card("c"),
    d: card("d", ["you", "claude"]),
    e: card("e", "claude"),
  },
  columns: { inbox: ["e"], next: ["a", "b", "c"], doing: ["d"] },
} as unknown as Board;

describe("laneModel", () => {
  const m = laneModel(board, "owner", ["inbox"]);

  it("puts a card without owner in the you lane, orders lanes you, claude and filters each lane's columns", () => {
    expect(m.lanes.map((l) => l.value)).toEqual(["you", "claude"]);
    expect(m.board.columns["next§you"]).toEqual(["b", "c"]);
    expect(m.board.columns["doing§you"]).toEqual(["d"]);
    expect(m.board.columns["next§claude"]).toEqual(["a"]);
  });

  it("draws skipped columns once, unfiltered, in front", () => {
    expect(m.left.map((c) => c.id)).toEqual(["inbox"]);
    expect(m.board.columns["inbox"]).toEqual(["e"]);
    expect(m.board.config.columns[0]?.id).toBe("inbox");
  });

  it("takes lane column ids apart again", () => {
    expect(plainColumnId("next§you")).toBe("next");
    expect(plainColumnId("inbox")).toBe("inbox");
    expect(laneOfColumnId("next§you")).toBe("you");
    expect(laneOfColumnId("inbox")).toBeNull();
  });
});
