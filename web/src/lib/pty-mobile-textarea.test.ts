import { describe, expect, it, vi } from "vitest";

import { updatePtyInputLine } from "./pty-mobile-input";
import { textareaEditBytes } from "./pty-mobile-textarea";

describe("textareaEditBytes", () => {
  // The replayed bytes and the tracked PTY line must agree on what one DEL
  // removes, or the replacement heuristics size their DELs to a stale line.
  it.each([
    ["xin chao", "xin chào"],
    ["vie", "viê"],
    ["việ", "vi"],
    ["việt", "việt"],
    ["xin chào việt", "xin chà việt"],
    ["👩‍👩‍👧 ok", "ok"],
    ["abc", ""],
  ])("replays %j -> %j onto the tracked line", (before, after) => {
    expect(updatePtyInputLine(before, textareaEditBytes(before, after))).toBe(after);
  });
});

describe("without Intl.Segmenter (Firefox < 125)", () => {
  it("still imports, and replays deletions per code point", async () => {
    vi.resetModules();
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    try {
      const bridge = await import("./pty-mobile-textarea");
      expect(bridge.textareaEditBytes("chao", "cha")).toBe("\x7f");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
