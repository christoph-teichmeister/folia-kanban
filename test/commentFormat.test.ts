import { describe, expect, it } from "vitest";
import { commentDate, commentWho } from "../src/ui/CardComments";

describe("comment header (fork)", () => {
  it("names a signed comment by its handle and an unsigned one as the reader", () => {
    expect(commentWho("claude", "")).toEqual({ name: "Claude", handle: "claude" });
    expect(commentWho(null, "")).toEqual({ name: "You", handle: null });
    expect(commentWho(null, "Chris")).toEqual({ name: "Chris", handle: null });
  });

  it("writes the date out and keeps the time, leaving odd stamps alone", () => {
    const day = new Date(2026, 9, 13).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(commentDate("2026-10-13 12:15")).toBe(`${day}, 12:15`);
    expect(commentDate("2026-10-13")).toBe(day);
    expect(commentDate("yesterday")).toBe("yesterday");
  });
});
