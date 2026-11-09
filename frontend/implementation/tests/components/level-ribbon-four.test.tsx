import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LevelRibbonBookmark } from "@/src/components/level/LevelRibbonBookmark";
import { LEVELS } from "@/src/domain/levels";
import { isLevelUnlocked } from "@/src/app/level-progress";

const KEY = "sketchbook.completedStages";
const setWidth = (px: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: px });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => cleanup());

describe("level list with four bookmarks (Bab 4 Pembuktian)", () => {
  it("shows one bookmark per level, including Bab 4", () => {
    render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={() => {}} />);
    expect(document.querySelectorAll(".bm-slot")).toHaveLength(4);
    expect(screen.getByTestId("level-card-4").getAttribute("aria-label")).toBe("Level 4, Pembuktian, terkunci");
  });

  it("keeps Bab 4 locked until Bab 3 is won, then it is the next one to open", () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, 2]));
    const { unmount } = render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={() => {}} isLevelUnlocked={isLevelUnlocked} />);
    expect(screen.getByTestId("level-card-4").dataset.state).toBe("locked");
    unmount();
    window.localStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={() => {}} isLevelUnlocked={isLevelUnlocked} />);
    expect(screen.getByTestId("level-card-4").dataset.state).toBe("open");
    expect(screen.getByTestId("level-thumb-4")).toBeTruthy();
  });

  it.each([800, 1000])("fits four ribbons and their gaps inside a %i px screen", (width) => {
    setWidth(width);
    render(<LevelRibbonBookmark levels={LEVELS} onSelectLevel={() => {}} />);
    const card = screen.getByTestId("level-card-4") as HTMLElement;
    const ribbon = parseFloat(card.style.width);
    const gap = Math.min(76, Math.max(26, width * 0.05));
    expect(4 * ribbon + 3 * gap).toBeLessThanOrEqual(width - 32);
  });
});
