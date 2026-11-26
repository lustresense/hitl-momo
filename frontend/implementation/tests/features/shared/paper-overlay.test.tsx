// @vitest-environment jsdom
import { StrictMode } from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  LC_GRADIENTS,
  PaperOverlay,
  R83_PAPER_GRAIN_TILE_URI,
} from "@/src/features/shared/PaperOverlay";
import { MomoStage } from "@/src/features/shared/MomoStage";
import { ScreenFrame } from "@/src/features/shared/ScreenFrame";

const ROOT_DIR = path.resolve(__dirname, "../../..");
const R83_CSS_FILES = [
  "app/styles/110-r83-fonts.css",
  "app/styles/111-r83-tokens.css",
  "app/styles/112-r83-paper.css",
  "app/styles/113-r83-nui.css",
  "app/styles/114-r83-momo.css",
] as const;

function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depthParen = 0;
  let depthBracket = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    const ch = prelude[i];
    if (ch === "(") depthParen += 1;
    else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === "," && depthParen === 0 && depthBracket === 0) {
      parts.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(prelude.slice(start).trim());
  return parts.filter(Boolean);
}

function collectCssSelectors(source: string): string[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const open = clean.indexOf("{", i);
    if (open === -1) break;
    const prelude = clean.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < clean.length && depth > 0) {
      if (clean[j] === "{") depth += 1;
      else if (clean[j] === "}") depth -= 1;
      j += 1;
    }
    const body = clean.slice(open + 1, j - 1);
    if (/^@(font-face|keyframes)\b/i.test(prelude)) {
      // At-rules without DOM selectors
    } else if (/^@(media|supports|layer)\b/i.test(prelude)) {
      out.push(...collectCssSelectors(body));
    } else if (prelude) {
      out.push(...splitSelectors(prelude));
    }
    i = j;
  }
  return out;
}

afterEach(() => {
  cleanup();
  document.getElementById("lc-defs")?.remove();
  document.getElementById("lc-paper-overlay")?.remove();
});

describe("PaperOverlay", () => {
  it("renders lc-defs with all 5 Polo Factory gradients and static 256px grain overlay", () => {
    render(<PaperOverlay />);

    const defs = document.getElementById("lc-defs");
    expect(defs).not.toBeNull();
    expect(defs?.tagName.toLowerCase()).toBe("svg");
    expect(defs?.getAttribute("aria-hidden")).toBe("true");
    expect(defs?.getAttribute("data-testid")).toBe("r83-paper-defs");

    for (const grad of LC_GRADIENTS) {
      const el = defs?.querySelector(`linearGradient#${grad.id}`);
      expect(el).not.toBeNull();
      const stops = el?.querySelectorAll("stop") ?? [];
      expect(stops.length).toBe(grad.stops.length);
      grad.stops.forEach((spec, idx) => {
        expect(stops[idx]?.getAttribute("offset")).toBe(String(spec.offset));
        expect(stops[idx]?.getAttribute("stop-color")).toBe(spec.stopColor);
      });
    }

    const overlay = document.getElementById("lc-paper-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("data-testid")).toBe("r83-paper-overlay");
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(overlay?.style.backgroundSize).toBe("256px 256px");
    expect(overlay?.style.backgroundRepeat).toBe("repeat");
    expect(overlay?.style.opacity).toBe("0.32");
    expect(overlay?.style.mixBlendMode).toBe("");
    expect(R83_PAPER_GRAIN_TILE_URI).toContain("feTurbulence");
    expect(R83_PAPER_GRAIN_TILE_URI).toContain("0.65");
  });

  it("renders lc-defs and lc-paper-overlay only once when mounted multiple times", () => {
    const first = render(<PaperOverlay />);
    const second = render(<PaperOverlay />);

    expect(document.querySelectorAll("#lc-defs")).toHaveLength(1);
    expect(document.querySelectorAll("#lc-paper-overlay")).toHaveLength(1);

    // Unmounting the first instance hands ownership to the second without losing defs.
    first.unmount();
    expect(document.querySelectorAll("#lc-defs")).toHaveLength(1);
    expect(document.querySelectorAll("#lc-paper-overlay")).toHaveLength(1);

    second.unmount();
    expect(document.querySelectorAll("#lc-defs")).toHaveLength(0);
    expect(document.querySelectorAll("#lc-paper-overlay")).toHaveLength(0);
  });

  it("is idempotent under React StrictMode", () => {
    render(
      <StrictMode>
        <PaperOverlay />
      </StrictMode>,
    );

    expect(document.querySelectorAll("#lc-defs")).toHaveLength(1);
    expect(document.querySelectorAll("#lc-paper-overlay")).toHaveLength(1);
  });

  it("does not duplicate an existing external #lc-defs element", () => {
    const external = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    external.id = "lc-defs";
    document.body.appendChild(external);

    render(<PaperOverlay />);

    expect(document.querySelectorAll("#lc-defs")).toHaveLength(1);
    expect(document.querySelectorAll("#lc-paper-overlay")).toHaveLength(1);
  });
});

describe("ScreenFrame", () => {
  it("sets data-ui='r83', default variant='page', r83- testid, and embeds PaperOverlay", () => {
    render(
      <ScreenFrame ariaLabel="Halaman uji">
        <p>Isi halaman</p>
      </ScreenFrame>,
    );

    const frame = screen.getByTestId("r83-screen-frame");
    expect(frame.getAttribute("data-ui")).toBe("r83");
    expect(frame.getAttribute("data-variant")).toBe("page");
    expect(frame.getAttribute("aria-label")).toBe("Halaman uji");
    expect(frame.textContent).toContain("Isi halaman");
    expect(document.querySelectorAll("#lc-defs")).toHaveLength(1);
    expect(document.querySelectorAll("#lc-paper-overlay")).toHaveLength(1);
  });

  it("supports cover variant and custom r83- testId", () => {
    render(
      <ScreenFrame variant="cover" testId="r83-cover-frame">
        <span>Sampul</span>
      </ScreenFrame>,
    );

    const frame = screen.getByTestId("r83-cover-frame");
    expect(frame.getAttribute("data-ui")).toBe("r83");
    expect(frame.getAttribute("data-variant")).toBe("cover");
    expect(frame.className).toContain("r83-screen-frame--cover");
  });
});

describe("r8.3 fonts & CSS performance guardrails", () => {
  it("provides valid WOFF2 font binaries decoded from sandbox fonts.css", () => {
    const fontsCss = fs.readFileSync(
      path.join(ROOT_DIR, "proto-html/r83/shared/fonts.css"),
      "utf8",
    );
    const fontCases = [
      { family: "Bowlby One", file: "public/fonts/BowlbyOne-Regular.woff2" },
      { family: "Hanken Grotesk", file: "public/fonts/HankenGrotesk-Variable.woff2" },
    ] as const;

    for (const entry of fontCases) {
      const fullPath = path.join(ROOT_DIR, entry.file);
      expect(fs.existsSync(fullPath)).toBe(true);
      const buf = fs.readFileSync(fullPath);
      expect(buf.length).toBeGreaterThan(1024);
      // WOFF2 header signature: 0x77 0x4F 0x46 0x32 ('wOF2')
      expect(buf.subarray(0, 4).toString("ascii")).toBe("wOF2");

      const re = new RegExp(
        `font-family:\\s*'${entry.family}'[\\s\\S]*?data:font/woff2;base64,([^)]+)`,
      );
      const match = re.exec(fontsCss);
      expect(match?.[1]).toBeTruthy();
      const expected = Buffer.from((match?.[1] ?? "").replace(/\s+/g, ""), "base64");
      expect(buf.equals(expected)).toBe(true);
    }
  });

  it("keeps 112-r83-paper.css free of mix-blend-mode and backdrop-filter (§5.6)", () => {
    const paperCss = fs.readFileSync(
      path.join(ROOT_DIR, "app/styles/112-r83-paper.css"),
      "utf8",
    );
    expect(paperCss).not.toMatch(/mix-blend-mode\s*:/i);
    expect(paperCss).not.toMatch(/backdrop-filter\s*:/i);
  });

  it("keeps all 5 r8.3 CSS partials 100% scoped to [data-ui=\"r83\"] without mix-blend-mode or backdrop-filter", () => {
    for (const rel of R83_CSS_FILES) {
      const css = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
      expect(css, `${rel} must not use mix-blend-mode`).not.toMatch(/mix-blend-mode\s*:/i);
      expect(css, `${rel} must not use backdrop-filter`).not.toMatch(/backdrop-filter\s*:/i);
      const selectors = collectCssSelectors(css);
      expect(selectors.length, `${rel} should have scoped selectors`).toBeGreaterThan(0);
      const leaked = selectors.filter((sel) => !sel.includes('[data-ui="r83"]'));
      expect(leaked, `${rel} has unscoped selectors`).toEqual([]);
    }
  });
});

describe("QA Parity Regressions (BERAT-5, SEDANG-2, SEDANG-3, SEDANG-4)", () => {
  it("BERAT-5: MomoStage uses .r83-momo without inline zIndex override and matches Polo Factory SVG selectors", () => {
    const { container } = render(
      <ScreenFrame>
        <MomoStage expression="Tenang" />
      </ScreenFrame>,
    );

    const momo = container.querySelector<HTMLDivElement>('[data-ui="r83"] .r83-momo');
    expect(momo).not.toBeNull();
    expect(container.querySelector(".r83-momo-stage")).toBeNull();
    expect(momo?.style.zIndex).toBe("");
    expect(momo?.style.position).toBe("fixed");
    expect(momo?.style.pointerEvents).toBe("none");

    // Verify real MomoEngine SVG elements match the 112/114 CSS selectors
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .root > path[fill="#2E0D06" i]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .fL > path[fill="#2E0D06" i]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .fR > path[fill="#2E0D06" i]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .tA path').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .tA circle').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .bow path')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo path[fill="#B2DB8E" i]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo path[fill="#E4551B" i]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .root > path[fill="#E4551B" i]:nth-of-type(3)')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .root > path[fill="#E4551B" i]:nth-of-type(4)')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .fL > path[fill="#E4551B" i]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .fR > path[fill="#E4551B" i]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .cL')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo .cR')).toHaveLength(1);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo [stroke="#2E0D06" i]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-ui="r83"] .r83-momo [stroke="#380C02" i]').length).toBeGreaterThan(0);

    const paperCss = fs.readFileSync(path.join(ROOT_DIR, "app/styles/112-r83-paper.css"), "utf8");
    const momoCss = fs.readFileSync(path.join(ROOT_DIR, "app/styles/114-r83-momo.css"), "utf8");

    // Preserve existing sandbox selectors & add MomoEngine selectors
    expect(paperCss).toContain('[data-ui="r83"] #momo .sleep-breath > path[fill="#2e0d06"]');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo .root > path[fill="#2E0D06" i]');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo .fL > path[fill="#2E0D06" i]');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo .fR > path[fill="#2E0D06" i]');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo .tA path');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo .bow path');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo path[fill="#B2DB8E" i]');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo path[fill="#b5da93" i]');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo path[fill="#E4551B" i]');
    expect(paperCss).toContain('[data-ui="r83"] .r83-momo [stroke="#2E0D06" i]');
    expect(paperCss).toContain("fill: url(#lc-body) #b5da93;");
    expect(paperCss).toContain("fill: url(#lc-wing) #e4551b;");
    expect(paperCss).toContain("stroke: url(#lc-wing) #e4551b;");

    expect(momoCss).toMatch(/\[data-ui="r83"\] \.r83-momo,\s*\[data-ui="r83"\] #momo\s*\{[^}]*z-index:\s*30;/);
    expect(momoCss).toContain('[data-ui="r83"] .r83-momo .cL');
    expect(momoCss).toContain('[data-ui="r83"] .r83-momo .cR');
    expect(momoCss).toContain('[data-ui="r83"] .r83-momo .root');
  });

  it("SEDANG-2: 114-r83-momo.css defines [data-side=\"down\"]::after, .is-visible, .has-extra, and .r83-bubble__extra", () => {
    const momoCss = fs.readFileSync(path.join(ROOT_DIR, "app/styles/114-r83-momo.css"), "utf8");

    expect(momoCss).toMatch(
      /\[data-ui="r83"\] \.r83-bubble\[data-side="down"\]::after,\s*\[data-ui="r83"\] #su-bubble\[data-side="down"\]::after\s*\{[^}]*top:\s*-11px;[^}]*bottom:\s*auto;[^}]*left:\s*var\(--tail-x,\s*50%\);|\[data-ui="r83"\] \.r83-bubble\[data-side="down"\]::after,\s*\[data-ui="r83"\] #su-bubble\[data-side="down"\]::after\s*\{[^}]*left:\s*var\(--tail-x,\s*50%\);[^}]*top:\s*-11px;[^}]*bottom:\s*auto;[^}]*transform:\s*translateX\(-50%\) rotate\(45deg\);[^}]*border-left:[^}]*border-top:/,
    );
    expect(momoCss).toMatch(
      /\[data-ui="r83"\] \.r83-bubble\.is-visible,\s*\[data-ui="r83"\] #su-bubble\.is-visible\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/,
    );
    expect(momoCss).toMatch(
      /\[data-ui="r83"\] \.r83-bubble\.has-extra,\s*\[data-ui="r83"\] #su-bubble\.has-extra\s*\{[^}]*pointer-events:\s*auto;[^}]*width:\s*min\(clamp\(340px,\s*30vw,\s*460px\),\s*calc\(100vw - 24px\)\)\s*!important;/,
    );
    expect(momoCss).toMatch(
      /\[data-ui="r83"\] \.r83-bubble__extra,\s*\[data-ui="r83"\] #su-bubble-extra\s*\{[^}]*margin-top:\s*10px;[^}]*font-weight:\s*700;/,
    );
    expect(momoCss).toMatch(
      /\[data-ui="r83"\] \.r83-bubble__extra:empty,\s*\[data-ui="r83"\] #su-bubble-extra:empty\s*\{[^}]*display:\s*none;/,
    );
  });

  it("SEDANG-3: 113-r83-nui.css dims/grays .r83-cursor-pencil and .r83-cursor-eraser when #hand-cursor is lost or frozen", () => {
    const nuiCss = fs.readFileSync(path.join(ROOT_DIR, "app/styles/113-r83-nui.css"), "utf8");

    expect(nuiCss).toContain('[data-ui="r83"] #hand-cursor.is-lost .hc-ring');
    expect(nuiCss).toContain('[data-ui="r83"] #hand-cursor[data-frozen="true"] .hc-ring');
    expect(nuiCss).toContain('[data-ui="r83"] #hand-cursor.is-lost .r83-cursor-pencil');
    expect(nuiCss).toContain('[data-ui="r83"] #hand-cursor.is-lost .r83-cursor-eraser');
    expect(nuiCss).toContain('[data-ui="r83"] #hand-cursor[data-frozen="true"] .r83-cursor-pencil');
    expect(nuiCss).toContain('[data-ui="r83"] #hand-cursor[data-frozen="true"] .r83-cursor-eraser');
    expect(nuiCss).toMatch(
      /\.r83-cursor-eraser\s*\{[^}]*color:\s*#9a968c\s*!important;[^}]*filter:\s*grayscale\(1\);[^}]*opacity:\s*\.55;/,
    );
  });

  it("SEDANG-4: 114-r83-momo.css hides #cam-pip and .r83-cam-pip placeholder pseudo-elements when .has-video is active", () => {
    const momoCss = fs.readFileSync(path.join(ROOT_DIR, "app/styles/114-r83-momo.css"), "utf8");

    expect(momoCss).toContain('[data-ui="r83"] .r83-cam-pip.has-video::before');
    expect(momoCss).toContain('[data-ui="r83"] .r83-cam-pip.has-video::after');
    expect(momoCss).toContain('[data-ui="r83"] #cam-pip.has-video::before');
    expect(momoCss).toContain('[data-ui="r83"] #cam-pip.has-video::after');
    expect(momoCss).toMatch(
      /\[data-ui="r83"\] \.r83-cam-pip\.has-video::before[\s\S]*?\[data-ui="r83"\] #cam-pip\.has-video::after[\s\S]*?\{[^}]*display:\s*none;/,
    );
  });

  it("overrides legacy #app constraints and restores content-box on .r83-bubble / #su-bubble", () => {
    const momoCss = fs.readFileSync(path.join(ROOT_DIR, "app/styles/114-r83-momo.css"), "utf8");

    expect(momoCss).toMatch(
      /\[data-ui="r83"\] #app\s*\{[^}]*max-width:\s*none;[^}]*margin:\s*0;[^}]*padding:\s*0;/,
    );
    expect(momoCss).toMatch(
      /\[data-ui="r83"\] \.r83-bubble,\s*\[data-ui="r83"\] #su-bubble\s*\{[^}]*box-sizing:\s*content-box;/,
    );
  });
});
