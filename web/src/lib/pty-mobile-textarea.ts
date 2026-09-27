// Keeps xterm's hidden textarea and the PTY line in step for mobile IMEs
// (#122766). The model: the PTY cursor sits at the end of the line, and the
// textarea caret is kept there too.

import { applyPtyLineEdits, graphemes } from "@/lib/pty-mobile-input";

const DELETE = "\x7f";

// Bytes that replay a textarea edit onto the PTY line: one DEL per grapheme
// back to the common prefix, then the retained tail. One IME event can remove
// several characters (Telex `chao` + `f` deletes `ao`, inserts `ào`), and the
// Ink composer deletes one grapheme per DEL.
export function textareaEditBytes(before: string, after: string): string {
  const prev = graphemes(before);
  const next = graphemes(after);
  let common = 0;
  while (common < prev.length && common < next.length && prev[common] === next[common]) {
    common++;
  }
  return DELETE.repeat(prev.length - common) + next.slice(common).join("");
}

export interface MobileTextareaBridge {
  /** Typed input xterm forwarded through onData (never mouse reports). */
  onTerminalData: (data: string) => void;
  dispose: () => void;
}

export function bridgeMobileTextarea(
  textarea: HTMLTextAreaElement,
  send: (data: string) => void,
): MobileTextareaBridge {
  let valueBeforeInput = textarea.value;
  const snapshot = () => {
    valueBeforeInput = textarea.value;
  };
  // xterm's `_inputEvent` forwards only `insertText`; Android IMEs delete with
  // no Backspace keydown, so the edit reaches the textarea but never the PTY.
  // Replay it from the textarea diff, not a fixed byte per event: the IME
  // already applied it, and one event can remove several characters.
  const replayDroppedEdit = (ev: Event) => {
    const input = ev as InputEvent;
    if (input.isComposing || !input.inputType.startsWith("delete")) {
      return;
    }
    const bytes = textareaEditBytes(valueBeforeInput, textarea.value);
    if (!bytes) {
      return;
    }
    send(bytes);
    // The replay leaves the PTY cursor at the end of the line. A mid-line
    // caret (Gboard space-bar swipe) would put the next insertion somewhere
    // else in the textarea than xterm puts it on the PTY.
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  };

  textarea.addEventListener("beforeinput", snapshot, true);
  textarea.addEventListener("input", replayDroppedEdit, true);
  return {
    onTerminalData: (data) => {
      // xterm cancels the Backspace keydown it turns into DEL, so without
      // this the textarea keeps text the line no longer has and the IME
      // composes against it.
      textarea.value = applyPtyLineEdits(textarea.value, data, false);
    },
    dispose: () => {
      textarea.removeEventListener("beforeinput", snapshot, true);
      textarea.removeEventListener("input", replayDroppedEdit, true);
    },
  };
}
