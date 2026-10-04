"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEVELS, getLevel } from "@/src/domain/levels";
import type { DrawingSurface } from "@/src/input";
import type { LevelDefinition } from "@/src/domain/levels";
import { createDevConsoleSink, type InteractionEventSink } from "@/src/domain/events";
import { FlowController } from "./state-machine";
import { useFlowSnapshot } from "@/src/hooks/use-flow";
import { createPredictionProvider, env } from "@/src/config/env";
import { MockPredictionProvider } from "@/src/prediction/mock-prediction-provider";
import type { DrawingInput } from "@/src/domain/types";
import { DevBanner } from "@/src/components/shared/DevBanner";
import { MomoBubble } from "@/src/components/momo/MomoBubble";
import { Top3Panel } from "@/src/components/prediction/Top3Panel";
import { PredictingScreen } from "@/src/components/prediction/PredictingScreen";
import { DecisionPanel } from "@/src/components/decision/DecisionPanel";
import { GameStage } from "@/src/components/game/GameStage";
import { CameraIntro } from "@/src/components/onboarding/CameraIntro";
import { TutorialBrochure } from "@/src/components/onboarding/TutorialBrochure";
import { DrawingScreen } from "@/src/components/drawing/DrawingScreen";

/**
 * TASK 01/03 — Application shell (client-only).
 * Owns the FlowController instance (single source of truth) and maps phases
 * to screens. No backend calls anywhere; providers are client adapters.
 */
export function SketchbookApp() {
  const [controller, setController] = useState<FlowController | null>(null);
  const [providerMode, setProviderMode] = useState<"mock" | "partner">(env.predictionMode);
  const [onboarding, setOnboarding] = useState<"camera" | "tutorial" | "levels">("camera");
  const surfaceRef = useRef<DrawingSurface | null>(null);
  const snapshot = useFlowSnapshot(controller);

  const enterLevel = useCallback((level: LevelDefinition) => {
    const provider = createPredictionProvider(level);
    setProviderMode(env.predictionMode === "partner" && env.predictionEndpoint ? "partner" : "mock");
    // TEST HOOKS ONLY (NEXT_PUBLIC_TEST_HOOKS=1): expose mock controls for E2E.
    if (env.testHooksEnabled && provider instanceof MockPredictionProvider) {
      const w = window as unknown as Record<string, unknown>;
      w.__skbMock = provider;
    }
    const sink: InteractionEventSink = createDevConsoleSink();
    const c = new FlowController({ provider, sink });
    setController(c);
    c.enterLevel(level);
  }, []);

  const navigateTo = useCallback(
    (route: string) => {
      if (typeof window !== "undefined") {
        window.history.pushState(null, "", route);
      }
      if (route.includes("/onboarding/card")) {
        setOnboarding("tutorial");
      } else if (route.includes("/canvas")) {
        setOnboarding("levels");
        if (LEVELS[0]) enterLevel(LEVELS[0]);
      } else {
        setOnboarding("camera");
      }
    },
    [enterLevel],
  );

  useEffect(() => {
    function syncRoute() {
      if (typeof window === "undefined") return;
      const path = window.location.pathname;
      if (path.includes("/onboarding/card")) {
        setOnboarding("tutorial");
      } else if (path.includes("/canvas")) {
        setOnboarding("levels");
        if (!controller && LEVELS[0]) {
          enterLevel(LEVELS[0]);
        }
      } else {
        setOnboarding("camera");
        if (path === "/" || path === "") {
          window.history.replaceState(null, "", "/onboarding/cam");
        }
      }
    }

    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [controller, enterLevel]);

  const level = useMemo(
    () => (snapshot?.levelId ? getLevel(snapshot.levelId) ?? null : null),
    [snapshot?.levelId],
  );

  async function handleSubmitDrawing() {
    if (!controller || !surfaceRef.current) return;
    const input = surfaceRef.current.toDrawingInput();
    await controller.submitDrawing(input);
  }
  if (onboarding === "camera") {
    return (
      <Shell mode={providerMode} onboarding>
        <CameraIntro
          modelUrl={env.mediapipeModelUrl}
          onWave={() => navigateTo("/onboarding/card")}
          onSkip={() => navigateTo("/onboarding/card")}
        />
      </Shell>
    );
  }

  if (onboarding === "tutorial") {
    return (
      <Shell mode={providerMode} onboarding>
        <TutorialBrochure onStart={() => navigateTo("/canvas")} />
      </Shell>
    );
  }


  /* ---------- LEVEL ENTRY / COMPLETE share the root layout ---------- */
  if (!snapshot || snapshot.phase === "level-entry") {
    return (
      <Shell mode={providerMode}>
        <section id="screen-level-entry" className="screen" aria-label="Pilih level">
          <h1>Buku Sketsa</h1>
          <p className="lead">
            Kamu adalah Illustrator dari luar buku sketsa. Hanya kamu yang bisa menciptakan objek.
          </p>
          <div className="level-list" data-testid="level-list">
            {LEVELS.map((lv) => (
              <button key={lv.levelId} type="button" className="level-card" onClick={() => enterLevel(lv)}>
                <span className="stage-tag">Tahap {lv.stage}</span>
                <h3>{lv.title}</h3>
                <p>{lv.stageEmphasis}</p>
              </button>
            ))}
          </div>
        </section>
      </Shell>
    );
  }

  const phase = snapshot.phase;

  return (
    <Shell mode={providerMode}>
      {phase === "drawing" && level && (
        <DrawingScreen
          key={level.levelId + String(snapshot.cyclesCompleted)}
          level={level}
          initialMode={env.defaultDrawInputMode}
          feedback={controller?.feedback ?? null}
          surfaceOut={surfaceRef}
          onSubmit={() => void handleSubmitDrawing()}
          onExit={() => controller?.exitToLevelEntry()}
        />
      )}

      {phase === "predicting" && (
        <PredictingScreen error={false} detail={null} onRetry={() => undefined} onRedraw={() => undefined} />
      )}

      {phase === "prediction-error" && (
        <PredictingScreen
          error
          detail={controller?.errorDetail ?? null}
          onRetry={() => void controller?.retryPrediction()}
          onRedraw={() => controller?.redrawFromError()}
        />
      )}

      {phase === "evaluating" && controller?.prediction && level && (
        <section id="screen-evaluating" className="screen" aria-label="Evaluasi prediksi">
          <div className="screen-head">
            <h2>Tebakan Momo (Top-3)</h2>
            <p className="lead">Confidence bukan jaminan benar. Kamu yang memutuskan.</p>
          </div>
          <div className="eval-layout">
            <Top3Panel result={controller.prediction} />
            <DecisionPanel
              prediction={controller.prediction}
              level={level}
              onAccept={() => {
                try {
                  controller.decideAccept();
                } catch {
                  /* guarded by phase; UI reflects state */
                }
              }}
              onCorrect={(rank) => {
                try {
                  controller.decideCorrect(rank);
                } catch {
                  /* guarded */
                }
              }}
              onOverride={(label) => {
                try {
                  controller.decideOverride(label);
                } catch {
                  /* DecisionError shown by picker validation upstream */
                }
              }}
              onRedraw={() => controller.requestRedraw("evaluation")}
            />
          </div>
        </section>
      )}

      {phase === "gameplay" && level && snapshot.behavior && snapshot.decision && controller && (
        <GameStage
          level={level}
          behavior={snapshot.behavior}
          decision={snapshot.decision}
          onOutcomeReported={(o) => controller.reportGameplayOutcome(o)}
          onRedraw={() => controller.requestRedraw("gameplay")}
        />
      )}

      {phase === "complete" && level && snapshot && controller && (
        <section id="screen-complete" className="screen" aria-label="Level selesai">
          <h1>Level Selesai</h1>
          <p id="complete-summary" className="lead">
            {level.title} selesai dalam {snapshot.cyclesCompleted} siklus keputusan.
          </p>
          <MomoBubble moment="level-complete" />
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="btn-back-to-levels"
              onClick={() => controller.exitToLevelEntry()}
            >
              Pilih Level
            </button>
          </div>
        </section>
      )}
    </Shell>
  );
}

function Shell({ mode, onboarding = false, children }: { mode: "mock" | "partner"; onboarding?: boolean; children: React.ReactNode }) {
  return (
    <div id="app" className={onboarding ? "onboarding-app" : undefined}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Sketchbook Universe</span>
        </div>
        <DevBanner mode={mode} />
      </header>
      <main id="screens">{children}</main>
      <footer className="app-footer">
        <span>DEV / PLACEHOLDER visuals — replaceable via design tokens &amp; asset slots.</span>
      </footer>
    </div>
  );
}
