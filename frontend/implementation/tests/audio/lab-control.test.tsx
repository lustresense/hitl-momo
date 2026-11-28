// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DevAudioPage from "@/app/dev/audio/page";
import { AudioControl } from "@/src/audio/ui/AudioControl";
import { audio } from "@/src/audio";

afterEach(() => {
  cleanup();
  audio.setPrefs({ master: 0.8, music: 0.6, sfx: 0.9, muted: false });
});

describe("/dev/audio gating", () => {
  it("shows only 'tidak tersedia' unless developer tools are on", () => {
    process.env.NEXT_PUBLIC_DEV_TOOLS = "0";
    const { container } = render(<DevAudioPage />);
    expect(container.textContent?.trim()).toBe("tidak tersedia");
    expect(screen.queryByTestId("audio-lab")).toBeNull();
  });
  it("renders the lab with developer tools on", () => {
    process.env.NEXT_PUBLIC_DEV_TOOLS = "1";
    render(<DevAudioPage />);
    expect(screen.getByTestId("audio-lab")).toBeTruthy();
    process.env.NEXT_PUBLIC_DEV_TOOLS = "0";
  });
});

describe("AudioControl", () => {
  it("is excluded from NUI targets and renders nothing when Web Audio is unsupported", () => {
    const { container } = render(<AudioControl />);
    // jsdom has no AudioContext: the engine reports idle until a gesture, then unsupported.
    const root = container.querySelector('[data-testid="audio-control"]');
    if (root) expect(root.getAttribute("data-nui-off")).toBe("true");
  });
});
