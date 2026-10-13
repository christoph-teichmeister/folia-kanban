import { describe, expect, it } from "vitest";
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
function args(pointer: { x: number; y: number } | null): Args {
  const rects = new Map([
    ["doing", rect(0, 600)],
    ["Idle.md", rect(40, 120)],
    ["Pair.md", rect(170, 120)],
  ]);
  return {
    active: { id: "next::Savy.md" },
    collisionRect: rect(60, 80),
    droppableRects: rects,
    droppableContainers: [...rects.keys()].map((id) => ({ id })),
    pointerCoordinates: pointer,
  } as unknown as Args;
}

describe("card drag target (fork)", () => {
  it("is the card under the pointer, not the one nearest the dragged card's corners", () => {
    expect(cardUnderPointer(args({ x: 150, y: 200 }), ["doing"])[0]?.id).toBe("Pair.md");
  });

  it("is the column when the pointer is over its empty space", () => {
    expect(cardUnderPointer(args({ x: 150, y: 500 }), ["doing"])[0]?.id).toBe("doing");
  });

  it("falls back to the nearest corners off every droppable", () => {
    expect(cardUnderPointer(args({ x: 900, y: 900 }), ["doing"])[0]?.id).toBe("Idle.md");
  });
});
