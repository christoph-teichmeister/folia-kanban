import { describe, it, expect } from "vitest";
import { boardLanes } from "../src/model/swimlanes";
import type { Board, Card } from "../src/model/types";

const card = (path: string, owner?: unknown): Card =>
  ({ path, frontmatter: owner === undefined ? {} : { owner } }) as unknown as Card;

describe("boardLanes", () => {
  const board = {
    cards: {
      a: card("a", "claude"),
      b: card("b", "you"),
      c: card("c"),
      d: card("d", ["you", "claude"]),
    },
    columns: { next: ["a", "b", "c"], doing: ["d"] },
  } as unknown as Board;

  it("puts you first, claude next, ownerless last, columns filtered per lane", () => {
    const lanes = boardLanes(board, "owner");
    expect(lanes.map((l) => l.value)).toEqual(["you", "claude", ""]);
    expect(lanes[0]?.columns).toEqual({ next: ["b"], doing: ["d"] });
    expect(lanes[1]?.columns).toEqual({ next: ["a"], doing: [] });
    expect(lanes[2]?.columns).toEqual({ next: ["c"], doing: [] });
  });

  it("keeps you and claude lanes even when empty, drops an empty ownerless lane", () => {
    const only = { cards: { a: card("a", "you") }, columns: { next: ["a"] } } as unknown as Board;
    expect(boardLanes(only, "owner").map((l) => l.value)).toEqual(["you", "claude"]);
  });
});
