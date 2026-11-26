import gsap from "gsap";
import { renderCharacterAFrontSvg } from "@/src/game/character/character-a-svg";
import { CHARACTER_A_CONFIG } from "@/src/game/character/character-rig-constants";

/**
 * Rig pose depan Thinman (port `proto-html/r83/shared/thinrig.js`).
 * Mengurai bagian SVG langsung dari `renderCharacterAFrontSvg(false)` tanpa memodifikasi `src/game/character/`.
 */

export interface ThinmanFrontParts {
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
  readonly styleCss: string;
  readonly legL: string;
  readonly legR: string;
  readonly footL: string;
  readonly footR: string;
  readonly armL: string;
  readonly armR: string;
  readonly pL: string;
  readonly pR: string;
  readonly hndLTransform: string;
  readonly hndRTransform: string;
  readonly hndPath: string;
  readonly torsoD: string;
  readonly headAttrs: string;
  readonly eyeLAttrs: string;
  readonly eyeRAttrs: string;
}

const splitSubpaths = (d: string): string[] => String(d).split(/(?=M)/).filter(Boolean);
const firstXY = (d: string): string => {
  const m = /M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(d);
  return m ? `${m[1]} ${m[2]}` : "100 150";
};

export function extractThinmanFrontParts(): ThinmanFrontParts {
  const raw = renderCharacterAFrontSvg(false);
  const styleMatch = /<style>([^<]+)<\/style>/.exec(raw);
  const styleCss =
    styleMatch?.[1] ??
    ".ch{fill:none;stroke:#000;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.ch .fill{fill:#fff}.ch .dot{fill:#000;stroke:none}.ch .hnd{stroke-width:3.6}";

  const plainPaths = [...raw.matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1] ?? "");
  const hndMatches = [...raw.matchAll(/<path class="hnd" transform="([^"]+)" d="([^"]+)"\/>/g)];
  const torsoMatch = /<path class="fill" d="([^"]+)"\/>/.exec(raw);
  const headMatch = /<ellipse class="fill" ([^/]+)\/>/.exec(raw);
  const eyeMatches = [...raw.matchAll(/<ellipse class="eye dot" ([^/]+)\/>/g)];

  const legs = splitSubpaths(plainPaths[0] ?? "");
  const feet = splitSubpaths(plainPaths[1] ?? "");
  const arms = splitSubpaths(plainPaths[2] ?? "");
  const armL = arms[0] ?? "M97 150C82 182 62 224 50 266";
  const armR = arms[1] ?? armL;

  return {
    viewBox: CHARACTER_A_CONFIG.vb,
    width: CHARACTER_A_CONFIG.W,
    height: CHARACTER_A_CONFIG.H,
    styleCss,
    legL: legs[0] ?? "",
    legR: legs[1] ?? legs[0] ?? "",
    footL: feet[0] ?? "",
    footR: feet[1] ?? feet[0] ?? "",
    armL,
    armR,
    pL: firstXY(armL),
    pR: firstXY(armR),
    hndLTransform: hndMatches[0]?.[1] ?? "translate(50 268) rotate(14)",
    hndRTransform: hndMatches[1]?.[1] ?? "translate(160 268) rotate(-10)",
    hndPath: hndMatches[0]?.[2] ?? "M-5 -1Q-8 6-3 11M0 0Q0 6 1 12M5 -1Q9 6 5 11",
    torsoD: torsoMatch?.[1] ?? "",
    headAttrs: headMatch?.[1] ?? 'cx="100" cy="66" rx="72" ry="56"',
    eyeLAttrs: eyeMatches[0]?.[1] ?? 'cx="83" cy="77" rx="3.4" ry="6.2"',
    eyeRAttrs: eyeMatches[1]?.[1] ?? 'cx="117" cy="77" rx="3.4" ry="6.2"',
  };
}

const PIVOTS = { feet: "100 389", hip: "101 300", neck: "100 124", eyes: "100 77", sh: "100 391" } as const;

interface RigElements {
  rg: Element | null;
  bd: Element | null;
  up: Element | null;
  aLo: Element | null;
  aL: Element | null;
  aRo: Element | null;
  aR: Element | null;
  hn: Element | null;
  hd: Element | null;
  eyes: Element | null;
  sh: Element | null;
}

export interface ThinmanFrontRig {
  mount(): boolean;
  turn(): Promise<void>;
  idle(): void;
  nod(): Promise<void>;
  wave(): Promise<void>;
  react(): Promise<void>;
  look(x?: number): void;
  kill(): void;
}

export function createThinmanFrontRig(heroEl: HTMLElement, artEl: HTMLElement): ThinmanFrontRig {
  let parts: ThinmanFrontParts | null = null;
  let R: RigElements | null = null;
  let timelines: gsap.core.Animation[] = [];
  let blinkTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const keep = <T extends gsap.core.Animation>(t: T): T => {
    timelines.push(t);
    return t;
  };
  const front = (g: Element | null) => {
    if (R?.up && g) R.up.appendChild(g);
  };
  const back = (g: Element | null) => {
    if (!R?.up || !g) return;
    const torso = R.up.querySelector(":scope > path.fill");
    if (torso) R.up.insertBefore(g, torso);
  };

  const mount = (): boolean => {
    parts = extractThinmanFrontParts();
    artEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${parts.viewBox}" width="${parts.width}" height="${parts.height}" role="img" aria-label="Thinman"><style>${parts.styleCss}</style><ellipse class="sh" cx="100" cy="391" rx="58" ry="6" fill="rgba(55,31,13,.22)"/><g class="ch"><g class="rg"><g class="bd"><path d="${parts.legL}"/><path d="${parts.legR}"/><path d="${parts.footL}"/><path d="${parts.footR}"/><g class="up"><g class="aLo"><g class="aL"><path d="${parts.armL}"/><path class="hnd" transform="${parts.hndLTransform}" d="${parts.hndPath}"/></g></g><g class="aRo"><g class="aR"><path d="${parts.armR}"/><path class="hnd" transform="${parts.hndRTransform}" d="${parts.hndPath}"/></g></g><path class="fill" d="${parts.torsoD}"/><g class="hn"><g class="hd"><ellipse class="fill" ${parts.headAttrs}/><g class="eyes"><ellipse class="eye dot" ${parts.eyeLAttrs}/><ellipse class="eye dot" ${parts.eyeRAttrs}/></g></g></g></g></g></g></g></svg>`;
    const q = (s: string) => artEl.querySelector(s);
    R = {
      rg: q(".rg"), bd: q(".bd"), up: q(".up"), aLo: q(".aLo"), aL: q(".aL"),
      aRo: q(".aRo"), aR: q(".aR"), hn: q(".hn"), hd: q(".hd"), eyes: q(".eyes"), sh: q(".sh"),
    };
    return Boolean(R.rg && R.bd && R.up && R.hd && R.eyes);
  };

  const turn = (): Promise<void> =>
    new Promise((res) => {
      if (disposed) { res(); return; }
      heroEl.classList.remove("flip");
      gsap.killTweensOf(artEl);
      const tl = gsap.timeline({ onComplete: () => { gsap.set(artEl, { clearProps: "transform" }); res(); } });
      tl.to(heroEl, { scaleY: 0.95, scaleX: 1.03, duration: 0.1, ease: "power2.in" })
        .to(artEl, { scaleX: 0.1, duration: 0.16, ease: "power2.in", transformOrigin: "50% 100%" }, "<")
        .add(() => { mount(); gsap.set(artEl, { scaleX: 0.1 }); })
        .to(artEl, { scaleX: 1, duration: 0.45, ease: "back.out(2.6)" })
        .to(heroEl, { scaleY: 1, scaleX: 1, duration: 0.8, ease: "elastic.out(1,.4)" }, "<.05");
      keep(tl);
    });

  const idle = (): void => {
    if (!R || !parts || disposed) return;
    const { pL, pR } = parts;
    keep(
      gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } })
        .to(R.up, { y: -2.4, scaleY: 1.012, svgOrigin: PIVOTS.hip, duration: 1.8 }, 0)
        .to(R.aL, { rotation: 2.4, svgOrigin: pL, duration: 1.8 }, 0.16)
        .to(R.aR, { rotation: -2.4, svgOrigin: pR, duration: 1.8 }, 0.16)
        .to(R.hd, { y: -1.3, rotation: 0.9, svgOrigin: PIVOTS.neck, duration: 1.8 }, 0.3)
        .to(R.sh, { scaleX: 0.95, opacity: 0.8, svgOrigin: PIVOTS.sh, duration: 1.8 }, 0),
    );
    const w = { ease: "power2.inOut" } as const;
    keep(
      gsap.timeline({ repeat: -1, repeatDelay: 1.4 })
        .to(R.rg, { x: 4, ...w, duration: 1.2 }, 0).to(R.up, { rotation: -0.9, svgOrigin: PIVOTS.hip, ...w, duration: 1.2 }, 0).to(R.hn, { rotation: 1.2, svgOrigin: PIVOTS.neck, ...w, duration: 1.2 }, 0.1)
        .to(R.rg, { x: -3, ...w, duration: 1.5 }, "+=2.2").to(R.up, { rotation: 0.8, svgOrigin: PIVOTS.hip, ...w, duration: 1.5 }, "<").to(R.hn, { rotation: -1, svgOrigin: PIVOTS.neck, ...w, duration: 1.5 }, "<.1")
        .to(R.rg, { x: 0, ...w, duration: 1.3 }, "+=2.6").to(R.up, { rotation: 0, svgOrigin: PIVOTS.hip, ...w, duration: 1.3 }, "<").to(R.hn, { rotation: 0, svgOrigin: PIVOTS.neck, ...w, duration: 1.3 }, "<.1"),
    );
    const blink = () => {
      blinkTimer = setTimeout(() => {
        if (disposed || !R?.eyes || !R.eyes.isConnected) return;
        keep(gsap.timeline().to(R.eyes, { scaleY: 0.08, svgOrigin: PIVOTS.eyes, duration: 0.07, ease: "power1.in" }).to(R.eyes, { scaleY: 1, duration: 0.13, ease: "power1.out" }));
        blink();
      }, 2200 + Math.random() * 3400);
    };
    blink();
  };

  const nod = (): Promise<void> => {
    if (!R || !parts || disposed) return Promise.resolve();
    const { pL, pR } = parts;
    return new Promise((res) => {
      keep(
        gsap.timeline({ onComplete: res })
          .to(R?.hn ?? null, { rotation: -2.2, svgOrigin: PIVOTS.neck, duration: 0.14, ease: "sine.out" })
          .to(R?.hn ?? null, { rotation: 9, duration: 0.2, ease: "power2.out" })
          .to(R?.bd ?? null, { y: 2.5, svgOrigin: PIVOTS.feet, duration: 0.2, ease: "power2.out" }, "<")
          .to(R?.aLo ?? null, { rotation: 3, svgOrigin: pL, duration: 0.24, ease: "power2.out" }, "<.04")
          .to(R?.aRo ?? null, { rotation: -3, svgOrigin: pR, duration: 0.24, ease: "power2.out" }, "<")
          .to(R?.hn ?? null, { rotation: 0, duration: 0.75, ease: "elastic.out(1,.55)" })
          .to(R?.bd ?? null, { y: 0, duration: 0.6, ease: "elastic.out(1,.6)" }, "<.05")
          .to([R?.aLo ?? null, R?.aRo ?? null], { rotation: 0, duration: 0.7, ease: "elastic.out(1,.6)" }, "<"),
      );
    });
  };

  const wave = (): Promise<void> => {
    if (!R || !parts || disposed) return Promise.resolve();
    const { pR } = parts;
    const armR = R.aRo;
    return new Promise((res) => {
      const t = gsap.timeline({ onComplete: () => { back(armR); res(); } });
      t.add(() => front(armR))
        .to(armR, { rotation: 12, svgOrigin: pR, duration: 0.14, ease: "sine.out" })
        .to(armR, { rotation: -125, duration: 0.5, ease: "back.out(1.6)" })
        .to(R?.up ?? null, { rotation: 1.4, svgOrigin: PIVOTS.hip, duration: 0.5, ease: "sine.out" }, "<")
        .to(R?.hn ?? null, { rotation: -4, svgOrigin: PIVOTS.neck, duration: 0.4, ease: "sine.out" }, "<.1")
        .to(armR, { rotation: -108, duration: 0.17, ease: "sine.inOut", yoyo: true, repeat: 5 })
        .to(armR, { rotation: 4, duration: 0.7, ease: "power2.inOut" })
        .to(R?.up ?? null, { rotation: 0, duration: 0.6, ease: "power2.inOut" }, "<")
        .to(R?.hn ?? null, { rotation: 0, duration: 0.6, ease: "power2.inOut" }, "<")
        .to(armR, { rotation: 0, duration: 0.5, ease: "elastic.out(1,.55)" });
      keep(t);
    });
  };

  const react = (): Promise<void> => {
    if (!R || !parts || disposed) return Promise.resolve();
    const { pL, pR } = parts;
    return new Promise((res) => {
      keep(
        gsap.timeline({ onComplete: res })
          .to(R?.bd ?? null, { scaleY: 0.93, scaleX: 1.04, svgOrigin: PIVOTS.feet, duration: 0.1, ease: "power2.in" })
          .to(R?.bd ?? null, { scaleY: 1.06, scaleX: 0.97, y: -7, duration: 0.16, ease: "power2.out" })
          .to(R?.eyes ?? null, { scaleY: 1.25, scaleX: 1.15, svgOrigin: PIVOTS.eyes, duration: 0.1 }, "<")
          .to(R?.aLo ?? null, { rotation: 16, svgOrigin: pL, duration: 0.16, ease: "power2.out" }, "<")
          .to(R?.aRo ?? null, { rotation: -16, svgOrigin: pR, duration: 0.16, ease: "power2.out" }, "<")
          .to(R?.bd ?? null, { scaleY: 1, scaleX: 1, y: 0, duration: 0.85, ease: "elastic.out(1,.45)" })
          .to(R?.eyes ?? null, { scaleY: 1, scaleX: 1, duration: 0.4, ease: "power2.out" }, "<")
          .to([R?.aLo ?? null, R?.aRo ?? null], { rotation: 0, duration: 0.7, ease: "elastic.out(1,.6)" }, "<"),
      );
    });
  };

  const look = (x = 0): void => {
    if (R?.eyes && !disposed) keep(gsap.to(R.eyes, { x, duration: 0.35, ease: "power2.out" }));
  };

  const kill = (): void => {
    disposed = true;
    timelines.forEach((t) => t.kill());
    timelines = [];
    if (blinkTimer !== null) { clearTimeout(blinkTimer); blinkTimer = null; }
    gsap.killTweensOf([heroEl, artEl]);
    gsap.set(artEl, { clearProps: "transform" });
    gsap.set(heroEl, { clearProps: "scaleX,scaleY,y" });
    gsap.set(heroEl, { xPercent: -50, yPercent: -100 });
  };

  return { mount, turn, idle, nod, wave, react, look, kill };
}
