// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { R83SkipBar, SkipButtonVisibilityContext } from "@/src/features/shared/R83SkipBar";

afterEach(cleanup);

const altQ = (extra: KeyboardEventInit = {}) =>
  fireEvent.keyDown(window, { code: "KeyQ", key: "q", altKey: true, ...extra });

describe("R83SkipBar shortcut Alt+Q", () => {
  it("skips once per press, like the button", () => {
    const onSkip = vi.fn();
    render(<R83SkipBar visible label="Memuat" onSkip={onSkip} />);
    altQ();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("ignores a plain Q, AltGr (Ctrl+Alt), Meta, Shift, other keys and a held key", () => {
    const onSkip = vi.fn();
    render(<R83SkipBar visible label="Memuat" onSkip={onSkip} />);
    fireEvent.keyDown(window, { code: "KeyQ", key: "q" });
    altQ({ ctrlKey: true });
    altQ({ metaKey: true });
    altQ({ shiftKey: true });
    altQ({ repeat: true });
    fireEvent.keyDown(window, { code: "KeyW", key: "w", altKey: true });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("does nothing while the bar is hidden, by prop or by the shell switch", () => {
    const onSkip = vi.fn();
    render(<R83SkipBar visible={false} label="Memuat" onSkip={onSkip} />);
    altQ();
    cleanup();
    render(
      <SkipButtonVisibilityContext.Provider value={false}>
        <R83SkipBar visible label="Memuat" onSkip={onSkip} />
      </SkipButtonVisibilityContext.Provider>,
    );
    altQ();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("turns off and on with the switch and stops listening after unmount", () => {
    const onSkip = vi.fn();
    const tree = (on: boolean) => (
      <SkipButtonVisibilityContext.Provider value={on}>
        <R83SkipBar label="Memuat" onSkip={onSkip} />
      </SkipButtonVisibilityContext.Provider>
    );
    const view = render(tree(false));
    view.rerender(tree(true));
    altQ();
    expect(onSkip).toHaveBeenCalledTimes(1);
    view.unmount();
    altQ();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("calls the handler of the scene that is on screen now", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<R83SkipBar visible label="Satu" onSkip={first} />);
    view.rerender(<R83SkipBar visible label="Dua" onSkip={second} />);
    altQ();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
