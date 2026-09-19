import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VoiceInputButton } from "../VoiceInputButton";
import type { VoiceInputMode } from "../../utils/voice";

function setup(
  props: {
    mode?: VoiceInputMode;
    isListening?: boolean;
    disabled?: boolean;
  } = {},
) {
  const onStart = vi.fn();
  const onStop = vi.fn();
  render(
    <VoiceInputButton
      mode={props.mode ?? "toggle"}
      isListening={props.isListening ?? false}
      disabled={props.disabled}
      onStart={onStart}
      onStop={onStop}
      label="Voice input"
    />,
  );
  return {
    button: screen.getByRole("button", { name: "Voice input" }),
    onStart,
    onStop,
  };
}

describe("VoiceInputButton", () => {
  it("reports whether it is listening through aria-pressed", () => {
    const idle = setup();
    expect(idle.button).toHaveAttribute("aria-pressed", "false");
  });

  it("is pressed while listening", () => {
    const { button } = setup({ isListening: true });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  describe("toggle mode", () => {
    it("starts on a click when idle", () => {
      const { button, onStart, onStop } = setup();
      fireEvent.click(button);
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStop).not.toHaveBeenCalled();
    });

    it("stops on a click while listening", () => {
      const { button, onStart, onStop } = setup({ isListening: true });
      fireEvent.click(button);
      expect(onStop).toHaveBeenCalledTimes(1);
      expect(onStart).not.toHaveBeenCalled();
    });

    it("does not react to a press on its own, only to the completed click", () => {
      const { button, onStart } = setup();
      fireEvent.pointerDown(button, { button: 0 });
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe("hold mode", () => {
    it("records from pointer down to pointer up", () => {
      const { button, onStart, onStop } = setup({ mode: "hold" });

      fireEvent.pointerDown(button, { button: 0 });
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStop).not.toHaveBeenCalled();

      fireEvent.pointerUp(button);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("stops when the press is cancelled, as when the OS takes over a touch", () => {
      const { button, onStop } = setup({ mode: "hold" });
      fireEvent.pointerDown(button, { button: 0 });
      fireEvent.pointerCancel(button);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("does not restart on the click that the browser fires after the release", () => {
      const { button, onStart, onStop } = setup({ mode: "hold" });
      fireEvent.pointerDown(button, { button: 0 });
      fireEvent.pointerUp(button);
      // A click produced by a pointer carries a click count; an assistive
      // technology activation (the bare clicks below) carries none.
      fireEvent.click(button, { detail: 1 });
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("ignores secondary mouse buttons", () => {
      const { button, onStart } = setup({ mode: "hold" });
      fireEvent.pointerDown(button, { button: 2 });
      expect(onStart).not.toHaveBeenCalled();
    });

    it.each([" ", "Enter"])(
      "records while %j is held on the keyboard",
      (key) => {
        const { button, onStart, onStop } = setup({ mode: "hold" });

        fireEvent.keyDown(button, { key });
        fireEvent.keyDown(button, { key, repeat: true });
        expect(onStart).toHaveBeenCalledTimes(1);

        fireEvent.keyUp(button, { key });
        expect(onStop).toHaveBeenCalledTimes(1);
      },
    );

    it("leaves other keys alone", () => {
      const { button, onStart } = setup({ mode: "hold" });
      fireEvent.keyDown(button, { key: "Tab" });
      expect(onStart).not.toHaveBeenCalled();
    });

    it("stops if focus leaves while a key is held", () => {
      const { button, onStop } = setup({ mode: "hold" });
      fireEvent.keyDown(button, { key: " " });
      fireEvent.blur(button);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("toggles on a bare click, which is how screen readers and switches activate it", () => {
      const { button, onStart } = setup({ mode: "hold" });
      fireEvent.click(button);
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("stops on a bare click while listening", () => {
      const { button, onStop } = setup({ mode: "hold", isListening: true });
      fireEvent.click(button);
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("suppresses the long-press context menu", () => {
      const { button } = setup({ mode: "hold" });
      // fireEvent returns false when a handler called preventDefault().
      expect(fireEvent.contextMenu(button)).toBe(false);
    });

    it("does not start from a press while disabled", () => {
      const { button, onStart } = setup({ mode: "hold", disabled: true });
      fireEvent.pointerDown(button, { button: 0 });
      fireEvent.keyDown(button, { key: " " });
      expect(onStart).not.toHaveBeenCalled();
    });
  });
});
