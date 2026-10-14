import { describe, expect, it } from "vitest";
import { relocAfter } from "../src/model/dragDrop";
import { cardUnderPointer } from "../src/ui/useBoardDrag";

type Args = Parameters<typeof cardUnderPointer>[0];

const rect = (top: number, height: number, left = 0, width = 300) => ({
  top,
  left,
  width,
  height,
  bottom: top + height,
  right: left + width,
});

/** A Doing column holding two cards; the dragged card's corners sit nearest the upper one. */
function args(pointer: { x: number; y: number } | null, draggedTop = 60): Args {
  const rects = new Map([
    ["doing", rect(0, 600)],
    ["doing::Idle.md", rect(40, 120)],
    ["doing::Pair.md", rect(170, 120)],
  ]);
  return {
    active: { id: "next::Savy.md" },
    collisionRect: rect(draggedTop, 80),
    droppableRects: rects,
    droppableContainers: [...rects.keys()].map((id) => ({ id })),
    pointerCoordinates: pointer,
  } as unknown as Args;
}

describe("card drag target (fork)", () => {
  it("is the card under the pointer, not the one nearest the dragged card's corners", () => {
    expect(cardUnderPointer(args({ x: 150, y: 200 }), ["doing"])[0]?.id).toBe("doing::Pair.md");
  });

  it("is the nearest card of the column when the pointer is over its empty space", () => {
    expect(cardUnderPointer(args({ x: 150, y: 500 }, 470), ["doing"])[0]?.id).toBe("doing::Pair.md");
  });

  it("falls back to the nearest corners off every droppable", () => {
    expect(cardUnderPointer(args({ x: 900, y: 900 }), ["doing"])[0]?.id).toBe("doing::Idle.md");
  });
});

describe("gap after a card's lower half (fork)", () => {
  const reloc = {
    activeId: "next::S.md",
    fromColumn: "next",
    toColumn: "doing",
    beforePath: "A.md",
  };

  it("moves the gap below the hovered card", () => {
    expect(relocAfter(reloc, ["A.md", "B.md"], "S.md").beforePath).toBe("B.md");
  });

  it("appends after the last card", () => {
    expect(relocAfter({ ...reloc, beforePath: "B.md" }, ["A.md", "B.md"], "S.md").beforePath).toBe(
      null,
    );
  });
});
