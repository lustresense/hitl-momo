"use client";

import React, { useEffect, useRef, useState, type FormEvent } from "react";
import gsap from "gsap";
import { audio } from "@/src/audio";
import {
  subscribeHandLandmarkerStatus,
  warmHandLandmarker,
  type HandLandmarkerStatus,
} from "../../camera/landmarker-warmup";
import {
  subscribeMonuiWarmupStatus,
  warmMonuiWorker,
  type MonuiWarmupStatus,
} from "@/src/app/monui-worker-warmup";
import { normalizeName } from "@/src/features/cover/name/normalize-name";
import "./DreamLoader.css";

const MAX_NICKNAME_CHARS = 24;
const DREAM_REACT_MS = 900;
/** Batas progres selama Momo menunggu nama (awan atas baru turun setelah progres > 65%). */
const ASK_PROGRESS_CAP = 35;

type DreamNamePhase = "waiting" | "ask" | "react" | "done";

export interface DreamLoaderProps {
  modelUrl: string;
  wasmRoot?: string;
  onReady?: () => void;
  minDurationMs?: number;
  warmRuntime?: "legacy" | "monui-worker";
  allowSkip?: boolean;
  readonly askNickname?: boolean;
  readonly classBadge?: string | null;
  readonly onSubmitNickname?: (name: string) => Promise<void> | void;
}

const M = {
  tail: "M717.5 1386C722 1486.5 752.6 1580.3 802.9 1647.2C829.1 1681.6 858.2 1710.5 889 1738.9C953.6 1798.3 1046.8 1861 1055.7 1990C1057.9 2021.3 1048.3 2057.6 1024.1 2058C1013.7 2058.1 1006.4 2052.4 1002.2 2037.5C1010 2000.3 1010.5 1974.6 997.7 1939.7C975 1877.6 927.6 1836.3 888.6 1801.9C814.2 1736.4 740 1672.1 702.7 1550C684.6 1490.8 678 1457.6 676.3 1391.1Z",
  bow: "M725.8 1316.1C768.2 1296 814.9 1282.1 858.5 1311.8C867.4 1318 876.3 1331.5 879.1 1346.1C881.2 1357.6 880.1 1369.9 876 1380C868.1 1399.9 850.5 1411.9 836.1 1416.6C794.4 1430.2 754.8 1412 717.5 1386L676.3 1391.1C638.8 1428.8 587.8 1466.4 543.2 1427.1C536.5 1421.2 530.9 1411.4 528.1 1400.5C526.1 1390.5 526.4 1385.9 527.7 1376C527.7 1376 527.7 1375.9 527.7 1375.9C527.7 1375.8 527.7 1375.8 527.7 1375.7C527.7 1375.7 527.8 1375.7 527.8 1375.8C545.7 1315.9 605.8 1310.6 643.8 1312.6ZM653.3 1351.7C645.5 1351.3 632.7 1351 625 1352.3C613.8 1353.9 569.3 1360.7 569.7 1384.4C573.5 1398.8 588.8 1398.4 597.4 1396.2C615.5 1389.1 639.3 1369.9 653.3 1351.7ZM788.6 1374.5C851.6 1387.9 848.7 1332.5 791.8 1338.7C772.8 1340.7 758.1 1344.4 739.4 1350.1C758.1 1361.8 768.6 1367.9 788.6 1374.5Z",
  flapL: "M184.4 767.4C178.1 815.3 162.5 856.8 141.5 893.8C131.8 910.8 115 943.1 98 937.5C92.1 935.4 86.1 925.1 81.9 918.9C69 898.3 55.3 879.5 41.1 861C28.4 844.4 12.5 831.7 1.2 813.2C-0.2 810.8 -0.2 807.6 0.3 804.7C4.3 797.1 21.8 782.9 29 775.7C56.5 748.2 99.6 704 119.2 664.1C116.4 658.6 116 656 114.5 649.5C115.5 645.1 117.2 637.6 119.5 634.8C129.5 622.6 141.3 610.4 151.7 599.3Z",
  flapR: "M1254.9 646.8C1263.3 657.1 1265.3 661.2 1260.9 676.6C1285.3 717.5 1310.8 744.2 1341.8 773.9C1355.5 786.9 1374.1 800.3 1387.4 814.4C1388.8 815.9 1389 820.1 1388.9 822.1C1388.7 826.2 1379.5 835.6 1377.4 837.8C1357.1 858.6 1337.4 878.8 1318.2 901.9C1306.7 915.7 1296.1 932.2 1284.5 945.2C1281.3 948.7 1275.9 950.3 1272.1 949.1C1254.9 943.7 1234.4 899.2 1224.4 878.5C1211.6 852.1 1198.3 807.6 1196.4 775.4Z",
  body: "M151.7 599.3L224.1 521.5C327.4 408.6 429.7 293.9 531.2 177.6C568.6 134.7 606.4 92.5 644.4 50.9C661.8 31.8 694.3 -14.9 716.6 4.7C733 19.1 752.5 44.3 767.9 62.5C809.9 112.3 851.8 162.4 893.4 213L1254.9 646.8L1196.4 775.4C1154.7 816.8 1113.7 864.7 1089.1 931.5C1083.4 947 1078.8 972.4 1070.5 984.8C1068 988.5 1058 991 1054.6 992.3C1029.5 999.8 1001.5 1017.6 978.5 1035C911.1 1086 847.4 1156.9 789.6 1229.8C769.3 1255.3 744.3 1288.2 725.8 1316.1L643.8 1312.6C562.5 1192.8 467.9 1064 359.5 1006.4C343.1 997.8 324.5 998 309.2 986.5C305.9 983.7 301.1 946.9 298.5 936.5C295.8 925.7 292.5 915.3 288.6 905.3C269.6 855.9 217.1 797.2 184.4 767.4L151.7 599.3Z",
  green: "M701.2 63.3C706.6 66.1 793.3 172.2 804.1 185.3L1083.1 520.9L1152.9 605.3C1164.1 619 1180 637.1 1190.2 651.1C1185.5 654.5 1180.5 657.4 1175.7 660.5C1076.2 725.6 970.4 816.4 926.2 973.6C921 992.2 916.2 1011.4 914 1031.3C852.4 1078.7 790.9 1148.1 738.8 1216.9C727.9 1231.5 717.3 1246.4 706.8 1261.7C701.1 1270.1 693.4 1282.1 687.3 1289.2C684.7 1289.7 686 1290 683.4 1287C678.9 1281.5 672.9 1272.1 668.6 1265.7C659.9 1252.7 651.1 1239.9 642.1 1227.2C598.3 1165.7 524.4 1067.3 469.9 1030.3C472.9 1009.9 463.4 969 457.9 949.1C413.5 788.3 291 697.3 190.8 633.8C203.6 621.7 224.1 597.8 236.8 583.9L330.9 480.3C397.8 406.4 464.4 331.8 530.6 256.4C587.7 191.3 642.9 126.2 701.2 63.3Z",
  mouth: "M839.7 643.3C855.3 641.6 871.1 656.4 857.1 677.4C783 789.7 622.9 796.8 544 696.4C535.1 684 515.1 655.6 538.4 645.5C556.2 637.7 563.4 653.4 574.1 670.7C578.3 677.5 584.8 684.1 590.2 688.9C651.1 740.8 736.1 737.9 796.9 687.4C807.3 678.8 815.5 668.7 823.9 656.6C829.1 649.3 831.7 646.2 838.7 643.7L839.7 643.3Z",
  d3: "M694.9 993.6C718.3 1023.8 741.2 1052.8 764.4 1083.8C742.2 1114.1 715.1 1145.9 692 1176.2C691.6 1176.7 691.9 1176.4 690.5 1177.1C687.6 1174.5 674.8 1155.5 671.4 1150.6C655.2 1128.1 639.2 1105.3 623.4 1082.3C647.1 1052.8 671.5 1023.3 694.9 993.6Z",
  d4: "M696.2 158.8C700 160.1 758.4 237.1 766.7 247.9C743.9 273.3 715.8 307.1 693.7 334.3C690.2 332.6 630.9 257.6 623.1 247.9C647.3 217.9 671.7 188.2 696.2 158.8Z",
  eyeLp: "M514.2 516.3C529.1 514.4 543.9 517.5 556.8 529.5C570 541.9 577.3 565.8 566.8 586.3C557.7 604.1 543.9 610.4 529.7 613.7C465 622.5 447 529.6 514.2 516.3Z",
  eyeLh: "M531.4 536.4C548.6 536 556.4 557.3 536 565.8C517 565.7 510.6 543.1 531.4 536.4Z",
  eyeRp: "M859.8 516.3C874.4 514.4 889 517.7 901.7 529.6C915 541.9 922.2 565.3 912 586C903.2 603.8 889.1 610.4 875 613.6C810 623.2 792.3 528.2 859.8 516.3Z",
  eyeRh: "M875.6 536.3C892.9 535.6 902.1 556 882.1 565.3C863.5 566.8 855.3 545.2 875.6 536.3Z",
  w9: "M172.2 661.8C178.6 665.1 185.1 669.3 191.3 673.3C286.5 734.7 408.5 832.7 433.2 998.2C401 977.7 378.2 962.3 342.4 955.2C341 934.3 330.9 906.1 323 889.1C288.9 816.2 235.1 778.7 186.3 733.5C186 702.5 182.2 688.2 172.2 661.8Z",
  w10: "M1204.4 682.5C1205.4 682.4 1204.7 682.4 1206.3 683C1200.5 699.1 1197.8 710.2 1195.7 727.9C1135.4 782.3 1069.5 856.8 1041.1 956.2C1014.8 965.7 981.9 984.6 957.3 1000.6L955.8 1000C956.5 993.8 960.2 980.2 961.8 974.3C1001.2 831.7 1113.7 737.9 1204.4 682.5Z",
  o11: "M1236.7 704.2C1239.3 708 1241.9 712.2 1244.4 716.2C1273 762.2 1308.5 791.6 1343.6 824.2C1330.9 835.5 1321.2 844.7 1309.1 857.5C1297.1 870.5 1286.2 883.7 1275.8 899.6C1242.6 845.6 1221 777.5 1236.7 704.2Z",
  o12: "M143.7 692.3C147.1 698.6 149.8 722.8 150 731.1C151.5 792.2 129.8 843.8 103.8 887.2C94.6 871.8 87.6 862.5 77.2 849.2C68 836.9 53.4 822.5 43 812.7C75.1 784.8 119.8 734.5 143.7 692.3Z",
};

const WING_GEOMETRY = {
  L: { a: [151.7, 599.3] as const, b: [184.4, 767.4] as const, tip: [110, 940] as const },
  R: { a: [1254.9, 646.8] as const, b: [1196.4, 775.4] as const, tip: [1306, 917] as const },
};

const DUR = { intro: 1.5, blast: 1.4, morph: 1.8 };
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeInOut = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function wingFrame(side: "L" | "R") {
  const { a, b, tip } = WING_GEOMETRY[side];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  let nx = -uy;
  let ny = ux;
  if (nx * (tip[0] - a[0]) + ny * (tip[1] - a[1]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { ax: a[0], ay: a[1], ux, uy, nx, ny, dTip: nx * (tip[0] - a[0]) + ny * (tip[1] - a[1]) };
}

const WING_FRAMES = { L: wingFrame("L"), R: wingFrame("R") };

function wingTransform(side: "L" | "R", angleDeg: number): string {
  const f = WING_FRAMES[side];
  const k = ((clamp(angleDeg, -50, 50) / 32) * 56) / f.dTip;
  const a = 1 + k * f.ux * f.nx;
  const c = k * f.ux * f.ny;
  const b = k * f.uy * f.nx;
  const d = 1 + k * f.uy * f.ny;
  const e = f.ax - a * f.ax - c * f.ay;
  const g = f.ay - b * f.ax - d * f.ay;
  return `matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${e.toFixed(6)} ${g.toFixed(6)})`;
}

interface DreamGeo {
  vw: number;
  vh: number;
  momoCenter: { x: number; y: number; w: number; h: number };
  bar: { x: number; y: number; w: number; h: number };
  sleepHead: { x: number; y: number };
  bubble: { x: number; y: number; w: number; h: number };
}

function computeDreamGeo(liftMomo = false): DreamGeo {
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const w = clamp(Math.min(vw * 0.42, vh * 0.25), 140, 215);
  const h = w * (2058 / 1389);
  const barW = Math.min(340, vw * 0.84);
  const barH = 48;
  const bar = { x: (vw - barW) / 2, y: vh - barH - (vw <= 580 ? 74 : 42), w: barW, h: barH };
  const mr = document.getElementById("momo")?.getBoundingClientRect();
  const gr = document.getElementById("gate")?.getBoundingClientRect();
  const sleepHead = mr && mr.width > 0 && mr.height > 0
    ? { x: mr.left + mr.width * 0.5, y: mr.top + mr.height * 0.3 }
    : { x: vw * 0.82, y: vh * 0.72 };
  const fw = Math.min(295, Math.max(220, vw > 580 ? vw * 0.23 : vw * 0.72));
  const bubble = gr && gr.width > 0 && gr.height > 0
    ? { x: gr.left, y: gr.top, w: gr.width, h: gr.height }
    : { x: clamp(sleepHead.x - fw * 0.8, 16, vw - fw - 16), y: clamp(sleepHead.y - 94, 18, vh - 84), w: fw, h: 64 };
  const liftOffset = liftMomo ? vh * 0.11 : vh * 0.04;
  return { vw, vh, momoCenter: { x: (vw - w) / 2, y: (vh - h) / 2 - liftOffset, w, h }, bar, sleepHead, bubble };
}

function populateAtmosphere(cloudsEl: HTMLDivElement | null, speedEl: HTMLDivElement | null) {
  const clouds: Array<{ n: HTMLDivElement; x: number; y: number; s: number; scale: number }> = [];
  const streaks: Array<{ n: HTMLDivElement; x: number; y: number; s: number }> = [];
  if (cloudsEl) {
    cloudsEl.replaceChildren();
    for (let i = 0; i < 9; i++) {
      const n = document.createElement("div");
      const w = 115 + ((i * 53) % 130);
      n.className = "cloud";
      n.style.width = `${w}px`;
      n.style.height = `${Math.round(w * 0.25)}px`;
      cloudsEl.appendChild(n);
      clouds.push({ n, x: ((i * 43.7) % 112) - 6, y: ((i * 39.1) % 135) - 20, s: 0.52 + (i % 4) * 0.14, scale: 0.74 + (i % 3) * 0.2 });
    }
  }
  if (speedEl) {
    speedEl.replaceChildren();
    for (let i = 0; i < 10; i++) {
      const n = document.createElement("div");
      n.className = "streak";
      n.style.height = `${80 + ((i * 43) % 120)}px`;
      speedEl.appendChild(n);
      streaks.push({ n, x: (i * 38.3) % 100, y: ((i * 31.1) % 120) - 10, s: 0.75 + (i % 3) * 0.18 });
    }
  }
  return { clouds, streaks };
}

function applyTailPlacement(tailEl: HTMLDivElement | null, gateEl: HTMLElement | null, cs: CSSStyleDeclaration | null) {
  if (!tailEl) return;
  const ink = "3px solid transparent";
  const bg = cs?.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "#eff3db";
  Object.assign(tailEl.style, { background: bg, border: "0", left: "", top: "", bottom: "", right: "" });
  if (gateEl?.dataset.side === "above") {
    tailEl.style.left = cs?.getPropertyValue("--tail-x") || "50%";
    tailEl.style.bottom = "-9px";
    tailEl.style.transform = "translateX(-50%) rotate(45deg)";
    tailEl.style.borderRight = ink;
    tailEl.style.borderBottom = ink;
  } else {
    tailEl.style.left = "-9px";
    tailEl.style.top = `clamp(18px, ${cs?.getPropertyValue("--tail-y") || "22px"}, 46px)`;
    tailEl.style.transform = "translateY(-50%) rotate(45deg)";
    tailEl.style.borderLeft = ink;
    tailEl.style.borderBottom = ink;
  }
}

export function DreamLoader({
  modelUrl,
  wasmRoot = "/mediapipe/wasm",
  onReady,
  minDurationMs = 1200,
  warmRuntime = "legacy",
  allowSkip = true,
  askNickname = false,
  classBadge = null,
  onSubmitNickname,
}: DreamLoaderProps) {
  const [shouldAskNickname] = useState(() => Boolean(askNickname));
  const [dreamNamePhase, setDreamNamePhase] = useState<DreamNamePhase>(() =>
    askNickname ? "waiting" : "done",
  );
  const [nameInput, setNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Membuka alam imajinasi…");
  const [loadFailed, setLoadFailed] = useState(false);
  const retryWarmRef = useRef<() => void>(() => undefined);
  const mouseFallbackRef = useRef<() => void>(() => undefined);
  const mouseFallbackChosenRef = useRef(false);
  const maybeCompleteRef = useRef<() => void>(() => undefined);
  const workerReadyRef = useRef(false);
  const dreamNamePhaseRef = useRef<DreamNamePhase>(dreamNamePhase);
  dreamNamePhaseRef.current = dreamNamePhase;
  const reactTimerRef = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const onSubmitNicknameRef = useRef(onSubmitNickname);
  onSubmitNicknameRef.current = onSubmitNickname;

  const stageRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const skipBtnRef = useRef<HTMLButtonElement>(null);
  const momoRef = useRef<SVGSVGElement>(null);
  const momoGroupRef = useRef<SVGGElement>(null);
  const wingLRef = useRef<SVGGElement>(null);
  const wingRRef = useRef<SVGGElement>(null);
  const tailGroupRef = useRef<SVGGElement>(null);
  const topCloudBankRef = useRef<SVGSVGElement>(null);
  const cloudsContainerRef = useRef<HTMLDivElement>(null);
  const speedContainerRef = useRef<HTMLDivElement>(null);
  const sharedRef = useRef<HTMLDivElement>(null);
  const barFillRef = useRef<HTMLDivElement>(null);
  const barTextRef = useRef<HTMLSpanElement>(null);
  const barUiRef = useRef<HTMLDivElement>(null);
  const bubbleCopyRef = useRef<HTMLDivElement>(null);
  const bubbleTailRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    phase: "intro" as "intro" | "loading" | "blast" | "morph" | "done",
    introV: 0,
    progress: 0,
    blastV: 0,
    morphing: false,
    ph: 0,
    windPos: 0,
  });

  const onReadyCalledRef = useRef(false);
  const morphStartedRef = useRef(false);
  const morphTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const allowSkipRef = useRef(allowSkip);
  allowSkipRef.current = allowSkip;

  useEffect(() => {
    if (shouldAskNickname && dreamNamePhase === "ask") {
      nameInputRef.current?.focus({ preventScroll: true });
    }
  }, [shouldAskNickname, dreamNamePhase]);

  useEffect(() => {
    return () => {
      if (reactTimerRef.current !== null) {
        window.clearTimeout(reactTimerRef.current);
        reactTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!stageRef.current) return;
    const sharedEl = sharedRef.current;
    const skyEl = skyRef.current;
    const state = stateRef.current;
    Object.assign(state, { phase: "intro", introV: 0, progress: 0, blastV: 0, morphing: false, ph: 0, windPos: 0 });
    onReadyCalledRef.current = false;
    morphStartedRef.current = false;
    workerReadyRef.current = false;
    mouseFallbackChosenRef.current = false;

    let geo = computeDreamGeo(shouldAskNickname);
    let hiddenGateEl: HTMLElement | null = null;
    let squashedMomoArt: HTMLElement | null = null;
    const { clouds, streaks } = populateAtmosphere(cloudsContainerRef.current, speedContainerRef.current);

    function restoreGateAndMomo() {
      if (hiddenGateEl) {
        hiddenGateEl.style.opacity = "";
        hiddenGateEl.style.transition = "";
        hiddenGateEl = null;
      }
      if (squashedMomoArt) {
        gsap.killTweensOf(squashedMomoArt);
        gsap.set(squashedMomoArt, { clearProps: "transform" });
        squashedMomoArt = null;
      }
    }

    function finishReady() {
      if (onReadyCalledRef.current) return;
      onReadyCalledRef.current = true;
      onReadyRef.current?.();
    }

    function updateFlight(dt: number) {
      const fast = state.phase === "blast";
      const amp = fast ? 1.0 : 0.85;
      state.ph += dt * (fast ? 1.3 : 0.9);
      const T = state.ph;
      const fy = amp * 42 * Math.sin((Math.PI * 2 * T) / 2.1 + 0.5);
      const fx = amp * 22 * Math.sin((Math.PI * 2 * T) / 3.1);
      const roll = amp * (fx / 22) * 6;
      const fw = T * Math.PI * 2 * 0.9;
      if (wingLRef.current) wingLRef.current.setAttribute("transform", wingTransform("L", Math.sin(fw) * 20 * amp));
      if (wingRRef.current) wingRRef.current.setAttribute("transform", wingTransform("R", Math.sin(fw - 0.05) * 20 * amp));
      const sway = amp * 25 * Math.sin((Math.PI * 2 * T) / 3.1 - 0.6);
      if (tailGroupRef.current) {
        tailGroupRef.current.setAttribute("transform", `translate(696 1388) rotate(${(amp * (sway / 25) * 8).toFixed(2)}) translate(-696 -1388)`);
      }
      const sc = state.phase === "intro" ? lerp(0.84, 1, state.introV) : 1;
      if (momoGroupRef.current) {
        momoGroupRef.current.setAttribute(
          "transform",
          `translate(${(695 + fx).toFixed(1)} ${(640 + fy).toFixed(1)}) rotate(${roll.toFixed(2)}) scale(${sc.toFixed(3)}) translate(-695 -640)`,
        );
      }
    }

    function updateMomoPosition() {
      let baseY = geo.momoCenter.y;
      if (state.phase === "intro") baseY = geo.momoCenter.y + (1 - state.introV) * (geo.vh * 0.58);
      else if (state.phase === "blast") baseY = geo.momoCenter.y - state.blastV * (geo.momoCenter.y + geo.momoCenter.h * 1.25);
      else if (state.phase === "morph" || state.phase === "done") baseY = -geo.momoCenter.h * 1.5;

      if (momoRef.current) {
        momoRef.current.style.width = `${geo.momoCenter.w}px`;
        momoRef.current.style.left = "0px";
        momoRef.current.style.top = "0px";
        momoRef.current.style.transform = `translate3d(${geo.momoCenter.x}px, ${baseY}px, 0)`;
      }
    }

    function updateTopClouds() {
      if (!topCloudBankRef.current) return;
      let y = -108;
      if (state.phase === "loading") y = lerp(-108, -6, easeInOut(clamp((state.progress - 65) / 35)));
      else if (state.phase === "blast") y = lerp(-6, 6, easeInOut(state.blastV));
      topCloudBankRef.current.style.transform = `translate3d(0, ${y.toFixed(2)}%, 0)`;
    }

    function updateEnvironment(dt: number) {
      const sp = state.phase === "blast" ? 2.5 : state.phase === "intro" ? 0.8 : 1.2 + (state.progress / 100) * 0.8;
      state.windPos += dt * 60 * sp;
      for (const c of clouds) {
        const yy = (((c.y / 100) * geo.vh + state.windPos * c.s) % (geo.vh + 420) + (geo.vh + 420)) % (geo.vh + 420) - 200;
        c.n.style.transform = `translate3d(${((c.x / 100) * geo.vw).toFixed(1)}px, ${yy.toFixed(1)}px, 0) scale(${c.scale})`;
      }
      for (const s of streaks) {
        const yy = (((s.y / 100) * geo.vh + state.windPos * s.s * 1.25) % (geo.vh + 380) + (geo.vh + 380)) % (geo.vh + 380) - 170;
        s.n.style.transform = `translate3d(${((s.x / 100) * geo.vw).toFixed(1)}px, ${yy.toFixed(1)}px, 0) scaleY(${1 + sp * 0.14})`;
        s.n.style.opacity = String(state.phase === "intro" ? 0 : clamp(0.14 + sp * 0.12, 0, 0.46));
      }
    }

    function syncSkyClip(radius: number) {
      if (!skyRef.current) return;
      skyRef.current.style.clipPath = `circle(${Math.max(0, radius).toFixed(1)}px at ${geo.sleepHead.x.toFixed(1)}px ${geo.sleepHead.y.toFixed(1)}px)`;
    }

    function handOver(gateEl: HTMLElement | null) {
      if (gateEl) {
        gateEl.style.opacity = "";
        void gateEl.offsetWidth;
      }
      const finishGate = () => {
        if (gateEl) gateEl.style.transition = "";
        hiddenGateEl = null;
        finishReady();
      };
      if (sharedRef.current) {
        gsap.to(sharedRef.current, { opacity: 0, duration: 0.28, ease: "power1.out", onComplete: finishGate });
      } else {
        finishGate();
      }
    }

    function startDreamMorph() {
      if (morphStartedRef.current || onReadyCalledRef.current) return;
      morphStartedRef.current = true;
      state.phase = "morph";
      state.morphing = true;
      geo = computeDreamGeo(shouldAskNickname);

      if (momoRef.current) momoRef.current.style.visibility = "hidden";
      if (skipBtnRef.current) {
        gsap.to(skipBtnRef.current, {
          opacity: 0,
          duration: 0.3,
          onComplete: () => { if (skipBtnRef.current) skipBtnRef.current.style.display = "none"; },
        });
      }

      const realGate = document.getElementById("gate");
      const realMomo = document.getElementById("momo");
      const cs = realGate ? getComputedStyle(realGate) : null;
      const momoArt = realMomo?.querySelector<HTMLElement>(".momo-art") ?? null;
      squashedMomoArt = momoArt;
      hiddenGateEl = realGate;

      if (bubbleCopyRef.current) {
        bubbleCopyRef.current.textContent = document.getElementById("gate-mumble")?.textContent || "Zzz... coba sapa aku, dong.";
      }
      applyTailPlacement(bubbleTailRef.current, realGate, cs);
      if (realGate) {
        realGate.style.transition = "none";
        realGate.style.opacity = "0";
      }

      const D = DUR.morph;
      const iris = { r: Math.hypot(geo.vw, geo.vh) };
      const morphTl = gsap.timeline({
        onComplete: () => {
          if (momoArt) gsap.set(momoArt, { clearProps: "transform" });
          squashedMomoArt = null;
          state.phase = "done";
          state.morphing = false;
          handOver(realGate);
        },
      });
      morphTimelineRef.current = morphTl;

      if (skyRef.current) {
        audio.emit("dream.iris"); // the sky closes like an iris; morphStartedRef above makes this once per load
        morphTl.to(iris, { r: 0, duration: D * 0.82, ease: "expo.inOut", onUpdate: () => syncSkyClip(iris.r) }, 0);
        morphTl.to(skyRef.current, { opacity: 0, duration: D * 0.35, ease: "power2.in" }, D * 0.52);
      }

      if (sharedRef.current) {
        const bg = cs?.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "#c8d9a4";
        morphTl.to(sharedRef.current, {
          x: 0,
          xPercent: 0,
          left: geo.bubble.x,
          top: geo.bubble.y,
          bottom: "auto",
          width: geo.bubble.w,
          height: geo.bubble.h,
          backgroundColor: bg,
          ...(cs?.boxShadow ? { boxShadow: cs.boxShadow } : {}),
          borderTopLeftRadius: cs?.borderTopLeftRadius || "22px",
          borderTopRightRadius: cs?.borderTopRightRadius || "22px",
          borderBottomRightRadius: cs?.borderBottomRightRadius || "22px",
          borderBottomLeftRadius: cs?.borderBottomLeftRadius || "22px",
          duration: D * 0.82,
          ease: "expo.inOut",
        }, 0);
      }

      if (barUiRef.current) morphTl.to(barUiRef.current, { opacity: 0, duration: D * 0.28, ease: "power2.out" }, 0.05);
      if (bubbleCopyRef.current) morphTl.to(bubbleCopyRef.current, { opacity: 1, duration: D * 0.38, ease: "power2.out" }, D * 0.56);
      if (bubbleTailRef.current) {
        morphTl.fromTo(bubbleTailRef.current, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: D * 0.34, ease: "back.out(1.8)" }, D * 0.62);
      }
      if (momoArt) {
        morphTl.to(momoArt, { scaleX: 1.03, scaleY: 0.95, duration: D * 0.16, ease: "power2.out" }, D * 0.68);
        morphTl.to(momoArt, { scaleX: 1, scaleY: 1, duration: D * 0.32, ease: "elastic.out(1, 0.5)" }, D * 0.84);
      }
    }

    function triggerBlastAndMorph() {
      if (state.phase === "blast" || state.phase === "morph" || state.phase === "done") return;
      state.phase = "blast";
      audio.emit("dream.blast"); // phase guard above: once per load
      if (sharedRef.current) {
        gsap.to(sharedRef.current, { scale: 1.03, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" });
      }
      gsap.to(state, { blastV: 1, duration: DUR.blast, ease: "power2.in", onUpdate: updateTopClouds, onComplete: startDreamMorph });
    }

    const tickerCallback = (_time: number, deltaTime: number) => {
      if (state.morphing || state.phase === "done") return;
      const dt = Math.min(deltaTime / 1000, 0.05);
      updateFlight(dt);
      updateMomoPosition();
      updateEnvironment(dt);
    };
    gsap.ticker.add(tickerCallback);

    if (sharedRef.current) {
      gsap.set(sharedRef.current, { left: geo.bar.x, top: geo.bar.y, width: geo.bar.w, height: geo.bar.h, xPercent: 0, bottom: "auto" });
    }
    syncSkyClip(Math.hypot(geo.vw, geo.vh));
    updateFlight(0);
    updateMomoPosition();
    updateTopClouds();

    const onResize = () => {
      if (state.morphing || state.phase === "done") return;
      geo = computeDreamGeo(shouldAskNickname);
      if (sharedRef.current) {
        gsap.set(sharedRef.current, { left: geo.bar.x, top: geo.bar.y, width: geo.bar.w, height: geo.bar.h, xPercent: 0, bottom: "auto" });
      }
      syncSkyClip(Math.hypot(geo.vw, geo.vh));
      updateMomoPosition();
      updateTopClouds();
    };
    window.addEventListener("resize", onResize);

    let unsub: (() => void) | null = null;
    let run = 0;

    function animateProgress(requested: number, finished?: () => void, durationOverride?: number) {
      const seq = ++run;
      /* Selama nama belum diisi, bar & awan atas tetap tenang supaya Momo tidak terasa "hampir menyentuh awan". */
      const asking = shouldAskNickname && dreamNamePhaseRef.current !== "done";
      const target = asking ? Math.min(requested, ASK_PROGRESS_CAP) : requested;
      gsap.killTweensOf(state, "progress");
      gsap.to(state, {
        progress: Math.max(target, asking ? state.progress : 0),
        duration: durationOverride ?? (target === 100 ? 0.45 : 0.55),
        ease: "power2.out",
        onUpdate: () => {
          const p = Math.round(state.progress);
          setProgress(p);
          if (barFillRef.current) {
            barFillRef.current.style.width = `${state.progress.toFixed(1)}%`;
            barFillRef.current.classList.toggle("is-full", state.progress >= 99.5);
          }
          if (barTextRef.current) barTextRef.current.textContent = `${p}%`;
          updateTopClouds();
        },
        onComplete: () => { if (seq === run && !onReadyCalledRef.current) finished?.(); },
      });
    }

    maybeCompleteRef.current = () => {
      if (state.phase !== "loading" || onReadyCalledRef.current) return;
      if (shouldAskNickname && dreamNamePhaseRef.current !== "done") return;
      if (!workerReadyRef.current) return;
      const isWorker = warmRuntime === "monui-worker";
      setStatusText(isWorker ? "Model NUI siap. Menuju awan…" : "Pelacak siap. Menuju awan…");
      animateProgress(100, triggerBlastAndMorph, shouldAskNickname ? 1.3 : undefined);
    };

    // Edge detectors for the model-status sounds: the warm-up may notify the same status more than once.
    let soundedReady = false;
    let soundedFailed = false;
    function onModelStatus(status: HandLandmarkerStatus | MonuiWarmupStatus) {
      if (state.phase !== "loading" || onReadyCalledRef.current || mouseFallbackChosenRef.current) return;
      const isWorker = warmRuntime === "monui-worker";
      if (status.kind !== "failed") soundedFailed = false;
      if (status.kind === "loading" || status.kind === "idle") {
        setLoadFailed(false);
        setStatusText(isWorker ? "Mengunduh model & WASM NUI…" : "Memuat pengenal tangan…");
        animateProgress(45);
      } else if (status.kind === "warming") {
        setLoadFailed(false);
        setStatusText(isWorker ? "Memanaskan model NUI (coldstart)…" : `Menyiapkan pengenal tangan (${status.delegate})…`);
        animateProgress(75);
      } else if (status.kind === "failed") {
        if (!soundedFailed) { soundedFailed = true; audio.emit("sys.hiccup"); } // neutral: model could not load
        setStatusText(isWorker ? "Model NUI gagal dimuat. Coba lagi atau pakai mouse." : "Pelacak gagal dimuat. Coba lagi atau gunakan pointer.");
        setLoadFailed(true);
        animateProgress(Math.min(state.progress, 75));
      } else if (status.kind === "ready") {
        if (!soundedReady) { soundedReady = true; audio.emit("sys.ready"); } // only after the models really report ready
        workerReadyRef.current = true;
        setLoadFailed(false);
        if (shouldAskNickname && dreamNamePhaseRef.current !== "done") {
          setStatusText(dreamNamePhaseRef.current === "react" ? "Menuju awan…" : "Model NUI siap! Tulis namamu dulu ya…");
          animateProgress(ASK_PROGRESS_CAP);
        } else if (shouldAskNickname) {
          maybeCompleteRef.current();
        } else {
          setStatusText(isWorker ? "Model NUI siap. Menuju awan…" : `Pelacak siap (${status.delegate}). Menuju awan…`);
          animateProgress(80, () => animateProgress(90, () => animateProgress(100, triggerBlastAndMorph)));
        }
      }
    }

    const yoloEnabled = process.env.NEXT_PUBLIC_MONUI_YOLO === "1";
    const runWarmup = () => {
      if (warmRuntime === "monui-worker") void warmMonuiWorker({ wasmRoot, modelUrl, yoloEnabled });
      else void warmHandLandmarker({ wasmRoot, modelUrl });
    };

    if (warmRuntime === "monui-worker") {
      runWarmup();
    }

    const beginLoading = () => {
      if (state.phase !== "intro" || onReadyCalledRef.current) return;
      state.phase = "loading";
      if (shouldAskNickname && dreamNamePhaseRef.current === "waiting") {
        dreamNamePhaseRef.current = "ask";
        setDreamNamePhase("ask");
      }
      unsub = warmRuntime === "monui-worker" ? subscribeMonuiWarmupStatus(onModelStatus) : subscribeHandLandmarkerStatus(onModelStatus);
      runWarmup();
    };

    retryWarmRef.current = () => {
      if (state.phase !== "loading" || onReadyCalledRef.current) return;
      setLoadFailed(false);
      runWarmup();
    };

    mouseFallbackRef.current = () => {
      if (onReadyCalledRef.current) return;
      mouseFallbackChosenRef.current = true;
      workerReadyRef.current = true;
      setLoadFailed(false);
      unsub?.();
      unsub = null;
      const waitingNickname = shouldAskNickname && dreamNamePhaseRef.current !== "done";
      if (waitingNickname) {
        setStatusText("Mode mouse siap! Tulis namamu dulu ya…");
        animateProgress(ASK_PROGRESS_CAP);
      } else {
        setStatusText("Lanjut dengan mouse…");
        state.progress = 100;
        setProgress(100);
        if (barFillRef.current) {
          barFillRef.current.style.width = "100%";
          barFillRef.current.classList.add("is-full");
        }
        if (barTextRef.current) barTextRef.current.textContent = "100%";
        restoreGateAndMomo();
        finishReady();
      }
    };

    const introDur = minDurationMs <= 500 ? 0.3 : DUR.intro;
    const mainTl = gsap.timeline({ onComplete: beginLoading });
    if (sharedRef.current) {
      mainTl.fromTo(sharedRef.current, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: introDur * 0.85, ease: "power3.out" }, 0);
    }
    // Momo rises into view: one whoosh when the rise starts (a killed StrictMode first run never starts, so it stays single).
    mainTl.to(state, { introV: 1, duration: introDur, ease: "power3.out", onStart: () => audio.emit("momo.whoosh") }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && allowSkipRef.current) {
        restoreGateAndMomo();
        finishReady();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      ++run;
      unsub?.();
      retryWarmRef.current = () => undefined;
      mouseFallbackRef.current = () => undefined;
      maybeCompleteRef.current = () => undefined;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onResize);
      restoreGateAndMomo();
      try { gsap.ticker.remove(tickerCallback); } catch {}
      try { mainTl?.kill(); } catch {}
      try { morphTimelineRef.current?.kill(); } catch {}
      morphTimelineRef.current = null;
      try { gsap.killTweensOf(state); } catch {}
      try { if (sharedEl) gsap.killTweensOf(sharedEl); } catch {}
      try { if (skyEl) gsap.killTweensOf(skyEl); } catch {}
    };
  }, [modelUrl, wasmRoot, minDurationMs, warmRuntime, shouldAskNickname]);

  const cleanedName = normalizeName(nameInput);

  const handleNicknameSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || dreamNamePhaseRef.current === "react" || dreamNamePhaseRef.current === "done") return;
    const cleaned = normalizeName(nameInput);
    if (!cleaned) {
      setNameError("Tulis nama panggilanmu dulu, ya.");
      nameInputRef.current?.focus({ preventScroll: true });
      return;
    }
    audio.emit("ui.tap"); // a valid nickname was submitted (the guards above rejected empty / repeated submits)
    setSubmitting(true);
    setNameError(null);
    try {
      await onSubmitNicknameRef.current?.(cleaned);
      setSubmittedName(cleaned);
      setSubmitting(false);
      dreamNamePhaseRef.current = "react";
      setDreamNamePhase("react");
      if (reactTimerRef.current !== null) window.clearTimeout(reactTimerRef.current);
      reactTimerRef.current = window.setTimeout(() => {
        reactTimerRef.current = null;
        dreamNamePhaseRef.current = "done";
        setDreamNamePhase("done");
        maybeCompleteRef.current();
      }, DREAM_REACT_MS);
    } catch (err) {
      setSubmitting(false);
      const msg = err instanceof Error && err.message.trim()
        ? err.message
        : "Gagal menyimpan nama. Coba sekali lagi, ya.";
      setNameError(msg);
    }
  };

  const handleSkip = () => {
    if (!allowSkipRef.current) return;
    if (!onReadyCalledRef.current) {
      const realGate = document.getElementById("gate");
      if (realGate) {
        realGate.style.opacity = "";
        realGate.style.transition = "";
      }
      onReadyCalledRef.current = true;
      onReadyRef.current?.();
    }
  };

  const showDreamBubble = shouldAskNickname && (dreamNamePhase === "ask" || dreamNamePhase === "react");

  return (
    <main
      ref={stageRef}
      id="dream"
      className={`dream-stage${shouldAskNickname ? " is-asking-name" : ""}`}
      data-testid="dream-loader"
      data-model-failed={loadFailed ? "true" : "false"}
      aria-label="Loading Momo Dream"
    >
      {allowSkip ? (
        <button
          ref={skipBtnRef}
          id="dr-skip"
          type="button"
          className="dream-skip-btn"
          onClick={handleSkip}
          data-testid="dream-loader-skip"
          aria-label="Lewati loading"
        >
          Lewati ✕
        </button>
      ) : null}

      <section ref={skyRef} id="dr-sky" className="dream-sky" aria-label="Langit mimpi Momo">
        <div className="chase" aria-hidden="true" />
        <div ref={cloudsContainerRef} id="dr-clouds" className="dream-clouds" aria-hidden="true" />
        <div ref={speedContainerRef} id="dr-speed" className="dream-speed" aria-hidden="true" />

        <svg ref={topCloudBankRef} id="dr-bank" className="dream-top-cloud-bank" viewBox="0 0 1440 460" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-80,0 L1520,0 L1520,285 C1410,375 1280,365 1190,295 C1080,395 920,390 810,305 C700,415 530,410 430,305 C330,390 180,385 95,295 C20,355 -35,345 -80,285 Z" fill="#edf3ea" />
          <path d="M-60,0 L1500,0 L1500,235 C1380,315 1240,300 1140,230 C1020,330 860,320 750,235 C630,335 470,325 360,235 C240,315 90,305 -60,230 Z" fill="#fffaf0" />
        </svg>

        <svg ref={momoRef} id="dr-momo" className="dream-momo" style={{ transform: "translate3d(calc(50vw - 88px), calc(40vh - 100px), 0)" }} viewBox="0 0 1389 2058" role="img" aria-label="Momo terbang di mimpi">
          <g ref={momoGroupRef} id="dr-mg">
            <g ref={tailGroupRef} id="dr-tail">
              <path d={M.tail} fill="#2e0d06" />
              <path d={M.bow} fill="#2e0d06" />
            </g>
            <g ref={wingLRef} id="dr-wl">
              <path d={M.flapL} fill="#2e0d06" />
              <path d={M.o12} fill="#e4551b" />
            </g>
            <g ref={wingRRef} id="dr-wr">
              <path d={M.flapR} fill="#2e0d06" />
              <path d={M.o11} fill="#e4551b" />
            </g>
            <g>
              <path d={M.body} fill="#2e0d06" />
              <path d={M.green} fill="#b5da93" />
              <path d={M.w9} fill="#e4551b" />
              <path d={M.w10} fill="#e4551b" />
              <path d={M.d3} fill="#e4551b" />
              <path d={M.d4} fill="#e4551b" />
            </g>
            <g transform="translate(0, -34)">
              <path d={M.eyeLp} fill="#380c02" />
              <path d={M.eyeLh} fill="#fff" transform="translate(0, -8)" />
              <path d={M.eyeRp} fill="#380c02" />
              <path d={M.eyeRh} fill="#fff" transform="translate(0, -8)" />
              <path d={M.mouth} fill="#380c02" transform="translate(0, 14)" />
            </g>
          </g>
        </svg>
      </section>

      {shouldAskNickname ? (
        <div
          className={`dream-name-bubble${showDreamBubble ? " is-open" : ""}${dreamNamePhase === "react" ? " is-react" : ""}`}
          data-testid="dream-name-bubble"
          data-nui-off="true"
        >
          <span className="dream-name-tail" aria-hidden="true" />
          {classBadge ? (
            <div className="dream-class-badge" data-testid="r83-entry-class-badge">
              {classBadge}
            </div>
          ) : null}
          <p className="dream-name-prompt" data-testid="dream-name-prompt" aria-live="polite">
            {dreamNamePhase === "react"
              ? `Oooo... ${submittedName}... zzz...`
              : "Zzz... eh, siapa nama panggilanmu?"}
          </p>
          <div className={`dream-name-collapse${dreamNamePhase === "react" ? " is-collapsed" : ""}`}>
            <div className="dream-name-collapse-inner">
              <form
                className="dream-name-form"
                data-nui-off="true"
                onSubmit={(e) => {
                  void handleNicknameSubmit(e);
                }}
              >
                <input
                  ref={nameInputRef}
                  type="text"
                  className="dream-name-input"
                  data-testid="r83-entry-name-input"
                  data-nui-off="true"
                  maxLength={MAX_NICKNAME_CHARS}
                  placeholder="Contoh: Rani"
                  autoComplete="off"
                  aria-label="Nama panggilan"
                  disabled={submitting || dreamNamePhase === "react"}
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                />
                <button
                  type="submit"
                  className="dream-name-submit"
                  data-testid="r83-entry-submit"
                  data-nui-off="true"
                  disabled={cleanedName.length === 0 || submitting || dreamNamePhase === "react"}
                >
                  {submitting ? "Menyimpan…" : "Lanjut"}
                </button>
              </form>
              {nameError ? (
                <p className="dream-name-error" role="alert" data-testid="r83-entry-submit-error">
                  {nameError}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div ref={sharedRef} id="dr-shared" className={`dream-shared${loadFailed ? " is-retry-open" : ""}`} role="status" aria-live="polite">
        <div
          ref={barUiRef}
          id="dr-barui"
          className="dream-bar-ui"
          role="progressbar"
          aria-label="Memuat Sketchbook Universe"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={statusText}
        >
          <div ref={barFillRef} id="dr-fill" className="dream-bar-fill" />
          <span ref={barTextRef} id="dr-text" className="dream-bar-text" data-testid="dream-loader-status">
            {progress}%
          </span>
        </div>
        {loadFailed ? (
          <div className="dream-retry-wrap">
            <p className="dream-retry-msg">{statusText}</p>
            <div className="dream-retry-actions">
              <button className="dream-retry-btn" type="button" data-testid="dream-loader-retry" onClick={() => retryWarmRef.current()}>
                Coba lagi
              </button>
              <button
                className="dream-retry-btn dream-retry-btn--mouse"
                type="button"
                data-testid="dream-loader-mouse-fallback"
                onClick={() => mouseFallbackRef.current()}
              >
                Lanjut pakai mouse
              </button>
            </div>
          </div>
        ) : null}
        <div ref={bubbleCopyRef} id="dr-copy" className="dream-bubble-copy" aria-hidden="true">
          Zzz... coba sapa aku, dong.
        </div>
        <div ref={bubbleTailRef} id="dr-tail2" className="dream-bubble-tail" aria-hidden="true" />
      </div>
    </main>
  );
}
