import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// CSS-reading guards for phone-width (<= 640 px) leftovers from the run12 tour screenshots.
// Paths are relative to the implementation folder, where vitest runs.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const kit = read("app/styles/96-kit-base.css");
const camera = read("app/styles/60-global-camera.css");

/** Text inside every `@media <query> { ... }` block in `src` (brace-matched). */
function mediaBlocks(src: string, query: string): string {
  const head = `@media ${query} {`;
  const parts: string[] = [];
  let i = src.indexOf(head);
  while (i !== -1) {
    let depth = 0;
    let j = i + head.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    parts.push(src.slice(i + head.length, j));
    i = src.indexOf(head, j);
  }
  return parts.join("\n");
}

/** Declarations of the rule whose selector is exactly `selector`, or undefined. */
function declsOf(css: string, selector: string): string | undefined {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`))?.[1];
}

/** A px value of `prop` in a declaration block. */
function pxOf(decls: string | undefined, prop: string): number | undefined {
  const m = decls?.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?[\\d.]+)px`));
  return m ? Number(m[1]) : undefined;
}

const phoneKit = mediaBlocks(kit, "(max-width: 640px)");
const phoneCamera = mediaBlocks(camera, "(max-width: 640px)");

describe("phone demo tape does not sit on Momo (run12 10-kanvas and 14-gameplay)", () => {
  it("the phone tape is no longer pinned at top: 76px, where Momo's kite is", () => {
    expect(phoneKit).not.toMatch(/top:\s*76px/);
  });

  it("the default phone tape sits in the bottom-right corner, which gameplay leaves free", () => {
    const decls = declsOf(phoneKit, ".demo-tape");
    expect(decls).toBeDefined();
    expect(pxOf(decls, "bottom")).toBe(10);
    expect(pxOf(decls, "right")).toBe(8);
    expect(decls).toMatch(/top:\s*auto/);
  });

  it("on the drawing canvas the tape sits at the top edge, above the kite tip (kite starts about 22 px down)", () => {
    const decls = declsOf(phoneKit, "#app:has(#screen-drawing) .demo-tape");
    expect(decls).toBeDefined();
    expect(decls).toMatch(/(?:^|[;\s])top:\s*0\b/);
    expect(decls).toMatch(/bottom:\s*auto/);
  });

  it("the tutorial override cannot stretch the tape (top and bottom both set would fill the screen height)", () => {
    const decls = declsOf(phoneKit, "#app:has(.tutorial-prototype-root) .demo-tape");
    expect(decls).toBeDefined();
    expect(decls).toMatch(/bottom:\s*auto/);
    expect(decls).toMatch(/right:\s*auto/);
  });

  it("the desktop tape is unchanged (1280x720 stays as it was)", () => {
    expect(pxOf(declsOf(kit, ".demo-tape"), "top")).toBe(10);
  });
});

describe("phone recap keeps the camera PIP off the recap cards (run12 17-rekap)", () => {
  it("the Pusat Halaman scroll area ends above the PIP (PIP: bottom 12 px + 100 px card + 12 px gap)", () => {
    const decls = declsOf(phoneCamera, ".center-page.ending-page");
    expect(decls).toBeDefined();
    expect(pxOf(decls, "bottom")).toBeGreaterThanOrEqual(124);
  });

  it("the phone PIP is still pinned bottom-left (the camera must stay visible for the thumb ring)", () => {
    expect(camera).toMatch(/\.global-camera-host\.mode-floating\s*,[\s\S]*?bottom:\s*12px\s*!important;\s*left:\s*12px\s*!important;/);
  });
});
