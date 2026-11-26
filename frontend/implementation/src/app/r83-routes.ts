import { formatLockedLevelMessage } from "@/src/domain/copy/levels";
import { LEVELS, type LevelDefinition } from "@/src/domain/levels";
import { isLevelUnlocked, isStageCompleted } from "./level-progress";

export type R83Route =
  | { readonly kind: "load" }
  | { readonly kind: "cover" }
  | { readonly kind: "tutorial" }
  | { readonly kind: "levels"; readonly notice: string | null }
  | { readonly kind: "level"; readonly level: LevelDefinition }
  | { readonly kind: "canvas"; readonly level: LevelDefinition }
  | { readonly kind: "ending" };

export function levelForStage(stage: number): LevelDefinition | undefined {
  return LEVELS.find((l) => l.stage === stage);
}

export function getLevelById(id: string): LevelDefinition | undefined {
  return LEVELS.find((l) => l.levelId === id);
}

export function readBrowserPathname(): string {
  if (typeof window === "undefined") return "/";
  return normalizeR83Pathname(window.location.pathname || "/");
}

export function safeExitFlowToLevelEntry(controller: { phase: string; exitToLevelEntry: () => void } | null): boolean {
  if (!controller || controller.phase === "level-entry") return true;
  try {
    controller.exitToLevelEntry();
    return true;
  } catch {
    return false;
  }
}

export function normalizeR83Pathname(rawPathname: string): string {
  const withoutHtml = rawPathname.replace(/(?:\/index)?\.html$/, "");
  if (withoutHtml.length > 1 && withoutHtml.endsWith("/")) {
    return withoutHtml.slice(0, -1);
  }
  return withoutHtml || "/";
}

/**
 * Resolves a browser pathname into the active r8.3 screen, applying level unlock guards
 * using "Level" terminology (O-8).
 */
export function resolveR83Route(
  pathname: string,
  unlocked: (stage: number) => boolean = isLevelUnlocked,
): R83Route {
  const clean = normalizeR83Pathname(pathname);
  if (clean === "/" || clean === "/load") {
    return { kind: "load" };
  }
  if (clean === "/onboarding/cam" || clean === "/onboarding/number") {
    return { kind: "cover" };
  }
  if (clean === "/onboarding/card") {
    return { kind: "tutorial" };
  }
  if (clean === "/levels") {
    return { kind: "levels", notice: null };
  }
  if (clean === "/ending") {
    return { kind: "ending" };
  }
  const levelMatch = /^\/level([123])$/.exec(clean);
  if (levelMatch) {
    const stage = Number(levelMatch[1]);
    const level = levelForStage(stage);
    if (!level) return { kind: "levels", notice: null };
    return unlocked(stage) ? { kind: "level", level } : { kind: "levels", notice: formatLockedLevelMessage(stage) };
  }
  const canvasMatch = /^\/canvas([123])$/.exec(clean);
  if (canvasMatch) {
    const stage = Number(canvasMatch[1]);
    const level = levelForStage(stage);
    if (!level) return { kind: "levels", notice: null };
    return unlocked(stage) ? { kind: "canvas", level } : { kind: "levels", notice: formatLockedLevelMessage(stage) };
  }
  return { kind: "load" };
}

export function pathForR83Route(route: R83Route): string {
  switch (route.kind) {
    case "load":
      return "/";
    case "cover":
      return "/onboarding/cam";
    case "tutorial":
      return "/onboarding/card";
    case "levels":
      return "/levels";
    case "level":
      return `/level${route.level.stage}`;
    case "canvas":
      return `/canvas${route.level.stage}`;
    case "ending":
      return "/ending";
  }
}

export function listCompletedStages(): readonly number[] {
  return [1, 2, 3].filter((stage) => isStageCompleted(stage));
}

export function deriveR83CanvasPhase(
  phase: string | undefined,
  stickerStage: boolean,
): "drawing" | "predicting" | "prediction-error" | "evaluating" {
  if (stickerStage) return "evaluating";
  if (phase === "predicting" || phase === "prediction-error" || phase === "evaluating") return phase;
  return "drawing";
}

export function deriveR83WorldPhase(phase: string | undefined): "falling" | "placing" | "gameplay" {
  if (phase === "falling" || phase === "placing" || phase === "gameplay") return phase;
  return "gameplay";
}
