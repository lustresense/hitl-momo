"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classContextFrom } from "@/src/api/submission-adapter";
import type { DrawingStamp } from "@/src/components/drawing/DrawingScreen";
import type { LevelRecap } from "@/src/components/ending/ending-types";
import type { ClassStatus } from "@/src/components/onboarding/StudentRulerSelector";
import { DEFAULT_CHARACTER_NAME, resolveCharacterDisplayName } from "@/src/config/character-tokens";
import type { LevelDefinition } from "@/src/domain/levels";
import type { CoverCompleteResult } from "@/src/features/cover";
import { normalizeName } from "@/src/features/cover/name/normalize-name";
import { useFlowSnapshot } from "@/src/hooks/use-flow";
import type { DrawingSurface } from "@/src/input";
import { consumeFreshUnlock, isLevelUnlocked, resetLevelProgress } from "../level-progress";
import {
  deriveR83CanvasPhase, deriveR83WorldPhase, getLevelById, listCompletedStages,
  normalizeR83Pathname, readBrowserPathname, resolveR83Route, safeExitFlowToLevelEntry, type R83Route,
} from "../r83-routes";
import { useClassroomSession } from "./useClassroomSession";
import { recapFromFlow, useLevelSession } from "./useLevelSession";
import { useR83Camera } from "./useR83Camera";

const FINAL_STAGE = 3;

function readBrowserJoinToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get("join") || p.get("join_token") || p.get("kelas") || undefined;
  } catch { return undefined; }
}

const deriveJoinStatus = (isJoined: boolean, token: string | null, err: string | null): ClassStatus =>
  isJoined ? "joined" : !token ? "none" : err ? "failed" : "joining";

/**
 * Orchestrates navigation, FlowController session, classroom context, camera/hand pipeline,
 * sticker handoff, and ending recaps for the r8.3 shell without touching legacy flag=0 code.
 */
export function useR83AppState() {
  const characterDisplayName = resolveCharacterDisplayName(process.env.NEXT_PUBLIC_CHARACTER_DISPLAY_NAME ?? DEFAULT_CHARACTER_NAME);
  const [initialJoinToken] = useState(readBrowserJoinToken);
  const classroom = useClassroomSession({ initialJoinToken });
  const classroomRef = useRef(classroom);
  classroomRef.current = classroom;
  const camera = useR83Camera();

  const [pathname, setPathname] = useState<string>(readBrowserPathname);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [fromName, setFromName] = useState(false);
  const [rulerConfirmed, setRulerConfirmed] = useState(false);
  const [drawingRevision, setDrawingRevision] = useState(0);
  const [thrownAttempt, setThrownAttempt] = useState<string | null>(null);
  const [introPlaying, setIntroPlaying] = useState(false);
  const [hasFinishedAll, setHasFinishedAll] = useState(false);
  const [freshUnlockStage, setFreshUnlockStage] = useState<number | null>(null);
  const [completedStages, setCompletedStages] = useState<ReadonlySet<number>>(() => new Set(listCompletedStages()));

  const wonFinalRef = useRef(false);
  const selectedNumberRef = useRef<number | undefined>(undefined);
  const surfaceRef = useRef<DrawingSurface | null>(null);
  const demoAttemptsRef = useRef(new Set<string>());
  const markDemoAttempt = useCallback((attemptId: string) => { demoAttemptsRef.current.add(attemptId); }, []); // "Lewati": never sent

  const navigateTo = useCallback((nextPath: string, replace = false) => {
    const clean = normalizeR83Pathname(nextPath);
    if (typeof window !== "undefined") {
      let target = clean;
      if (clean === "/") {
        const params = new URLSearchParams(window.location.search);
        if (!params.has("join") && !params.has("join_token") && !params.has("kelas") && classroomRef.current.joinToken) {
          params.set("join", classroomRef.current.joinToken);
        }
        target = params.toString() ? `${clean}?${params.toString()}` : clean;
      }
      if (normalizeR83Pathname(window.location.pathname) !== clean || (clean === "/" && `${window.location.pathname}${window.location.search}` !== target)) {
        if (replace) window.history.replaceState(null, "", target);
        else window.history.pushState(null, "", target);
      }
    }
    setPathname(clean);
  }, []);

  const routeBridge = useMemo(() => ({ setRouteNotice, redirectToLockedNotice: () => navigateTo("/levels", true) }), [navigateTo]);

  const session = useLevelSession(routeBridge, {
    outbox: classroom.outbox,
    tokenProvider: () => classroomRef.current.session?.student_session_token,
    classContext: () => classContextFrom(classroomRef.current.joinToken, classroomRef.current.session),
    isDemoAttempt: (attemptId: string) => demoAttemptsRef.current.has(attemptId),
  });

  const { controller, enterLevel, recordRecap, exitToLevels } = session;
  const snapshot = useFlowSnapshot(controller);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => setPathname(readBrowserPathname());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const route: R83Route = useMemo(() => resolveR83Route(pathname, isLevelUnlocked), [pathname]);

  useEffect(() => {
    if (route.kind !== "cover" && route.kind !== "load") setRulerConfirmed(false);
    if (route.kind === "levels") {
      if (route.notice) setRouteNotice(route.notice);
      if (pathname !== "/levels") navigateTo("/levels", true);
      setCompletedStages(new Set(listCompletedStages()));
      const fresh = consumeFreshUnlock();
      if (fresh !== null) setFreshUnlockStage(fresh);
    } else if (routeNotice !== null && route.kind !== "cover") {
      setRouteNotice(null);
      setFreshUnlockStage(null);
    }
  }, [route, pathname, navigateTo, routeNotice]);

  const activeLevel = useMemo(() => (snapshot?.levelId ? getLevelById(snapshot.levelId) ?? null : null), [snapshot?.levelId]);

  useEffect(() => {
    if (route.kind !== "level" && route.kind !== "canvas") return;
    if (controller?.level?.levelId === route.level.levelId) return;
    if (controller && !safeExitFlowToLevelEntry(controller)) return;
    const skip = route.kind === "canvas";
    enterLevel(route.level, { skipIntro: skip });
    setIntroPlaying(!skip);
  }, [route, controller, enterLevel]);

  useEffect(() => {
    if (route.kind !== "level" || introPlaying) return;
    if (snapshot?.phase === "drawing" && !snapshot.behavior) navigateTo(`/canvas${route.level.stage}`, true);
  }, [route, introPlaying, snapshot?.phase, snapshot?.behavior, navigateTo]);

  useEffect(() => {
    if (controller && activeLevel && snapshot?.decision) recordRecap(recapFromFlow(activeLevel, controller));
  }, [controller, activeLevel, snapshot?.decision, recordRecap]);

  const stickerStage = snapshot?.phase === "falling" && snapshot.behavior !== null && snapshot.attemptId !== null && snapshot.attemptId !== thrownAttempt;

  const resetStudentProgress = useCallback(() => {
    resetLevelProgress();
    setCompletedStages(new Set());
    setFreshUnlockStage(null);
    setHasFinishedAll(false);
    wonFinalRef.current = false;
  }, []);

  const handleDreamNickname = useCallback(async (rawName: string) => {
    const cleaned = normalizeName(rawName);
    if (!cleaned) return;
    const cls = classroomRef.current;
    if (cls.joinToken) {
      if (cls.isJoined && cls.session) {
        if (normalizeName(cls.session.name).toLowerCase() !== cleaned.toLowerCase()) {
          cls.leaveClass({ keepJoinInfo: true });
          resetStudentProgress();
          await cls.joinClass(undefined, cleaned);
        }
      } else {
        await cls.joinClass(undefined, cleaned);
      }
    }
    setStudentName(cleaned);
    setFromName(true);
  }, [resetStudentProgress]);
  const handleLoadReady = useCallback(() => { navigateTo("/onboarding/cam", true); }, [navigateTo]);
  const handleRulerConfirm = useCallback((studentNumber: number) => {
    selectedNumberRef.current = studentNumber;
    setRulerConfirmed(true);
  }, []);
  const handleCoverComplete = useCallback(
    ({ studentName: pickedName, demoName }: CoverCompleteResult) => {
      const finalName = pickedName || studentName;
      setStudentName(finalName);
      setFromName(true);
      if (!demoName && classroomRef.current.joinToken && !classroomRef.current.isJoined) {
        void classroomRef.current.joinClass(selectedNumberRef.current, finalName || "Siswa").catch(() => undefined);
      }
      navigateTo("/onboarding/card");
    },
    [navigateTo, studentName],
  );

  const handleTutorialStart = useCallback(() => navigateTo("/levels"), [navigateTo]);

  const handleSelectLevel = useCallback(
    (level: LevelDefinition) => {
      setRouteNotice(null);
      wonFinalRef.current = false;
      setFreshUnlockStage(null);
      if (!safeExitFlowToLevelEntry(controller)) return;
      enterLevel(level, { skipIntro: false });
      setIntroPlaying(true);
      navigateTo(`/level${level.stage}`);
    },
    [controller, enterLevel, navigateTo],
  );

  const handleIntroFinish = useCallback(() => {
    setIntroPlaying(false);
    const stage = activeLevel?.stage ?? (route.kind === "level" ? route.level.stage : 1);
    navigateTo(`/canvas${stage}`);
  }, [activeLevel?.stage, route, navigateTo]);

  const handleSubmitDrawing = useCallback(async () => {
    if (!controller || !surfaceRef.current || controller.getSnapshot().phase !== "drawing") return;
    await controller.submitDrawing(surfaceRef.current.toDrawingInput());
  }, [controller]);

  const handleThrowSticker = useCallback(() => {
    setThrownAttempt(snapshot?.attemptId ?? null);
    setIntroPlaying(false);
    const stage = activeLevel?.stage ?? (route.kind === "canvas" ? route.level.stage : 1);
    navigateTo(`/level${stage}`);
  }, [snapshot?.attemptId, activeLevel?.stage, route, navigateTo]);

  const handleRedrawSticker = useCallback(() => {
    try { controller?.requestRedraw("evaluation"); } catch { /* FlowController phase guard */ }
    setDrawingRevision((n) => n + 1);
  }, [controller]);

  const stamp: DrawingStamp | null =
    stickerStage && controller && snapshot?.behavior && snapshot.decision
      ? {
          label: snapshot.decision.finalLabel,
          behavior: snapshot.behavior,
          drawingInput: controller.drawingInput,
          onThrow: handleThrowSticker,
          onRedraw: handleRedrawSticker,
        }
      : null;

  const handleBumpDrawingRevision = useCallback(() => {
    setDrawingRevision((n) => n + 1);
    const stage = activeLevel?.stage ?? (route.kind === "level" ? route.level.stage : 1);
    navigateTo(`/canvas${stage}`);
  }, [activeLevel?.stage, route, navigateTo]);

  const handleBackFromWorld = useCallback(() => {
    exitToLevels();
    setCompletedStages(new Set(listCompletedStages()));
    const fresh = consumeFreshUnlock();
    if (fresh !== null) setFreshUnlockStage(fresh);
    const next = wonFinalRef.current ? "/ending" : "/levels";
    wonFinalRef.current = false;
    navigateTo(next, true);
  }, [exitToLevels, navigateTo]);

  const handleExitCanvas = useCallback(() => {
    const stage = activeLevel?.stage ?? (route.kind === "canvas" ? route.level.stage : 1);
    if (session.creationsRef.current.snapshot().length > 0 && snapshot?.phase !== "drawing") {
      navigateTo(`/level${stage}`);
    } else {
      exitToLevels();
      navigateTo("/levels");
    }
  }, [activeLevel?.stage, route, session.creationsRef, snapshot?.phase, exitToLevels, navigateTo]);

  const handleWon = useCallback(() => {
    setCompletedStages(new Set(listCompletedStages()));
    if ((activeLevel?.stage ?? 0) === FINAL_STAGE) {
      wonFinalRef.current = true;
      setHasFinishedAll(true);
    }
  }, [activeLevel?.stage]);

  const handleEndingChoose = useCallback(() => {
    classroomRef.current.leaveClass({ keepJoinInfo: true });
    resetStudentProgress();
    setStudentName("");
    setFromName(false);
    setRulerConfirmed(false);
    selectedNumberRef.current = undefined;
    setThrownAttempt(null);
    exitToLevels();
    navigateTo("/");
  }, [resetStudentProgress, exitToLevels, navigateTo]);

  const recaps: LevelRecap[] = session.getRecaps();

  return {
    route, characterDisplayName, classroom,
    joinStatus: deriveJoinStatus(classroom.isJoined, classroom.joinToken, classroom.error),
    rulerConfirmed, camera, studentName, fromName, completedStages, freshUnlockStage,
    hasFinishedAll, routeNotice, introPlaying,
    activeLevel: activeLevel ?? (route.kind === "level" || route.kind === "canvas" ? route.level : null),
    controller, snapshot, providerMode: session.providerMode, surfaceRef, drawingRevision,
    canvasPhase: deriveR83CanvasPhase(snapshot?.phase, stickerStage),
    worldPhase: deriveR83WorldPhase(snapshot?.phase),
    stamp, missionOpen: session.missionOpen, setMissionOpen: session.setMissionOpen,
    creations: session.creationsRef.current, recaps,
    handleDreamNickname, handleLoadReady, handleRulerConfirm, handleCoverComplete,
    handleTutorialStart, handleSelectLevel, handleIntroFinish, handleSubmitDrawing,
    handleExitCanvas, handleBumpDrawingRevision, handleBackFromWorld, handleWon,
    handleEndingChoose, handleCreationsChange: session.handleCreationsChange, markDemoAttempt,
  };
}
