"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { CANVAS_COPY } from "@/src/domain/copy/canvas";
import { HOLD_MS_DEFAULT } from "@/src/nui/core/constants";
import { useNuiTarget, useOptionalNui } from "@/src/nui/react";
import { CANVAS_TOOLS, type ActiveBrushTool, type CanvasToolDefinition, type CanvasToolId } from "./tools";
import "./canvas.css";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type ToolbarVariant = "canvas" | "tutorial";

export interface ToolbarProps {
  /** Active brush tool (`"pencil"` | `"eraser"`). */
  readonly activeTool: ActiveBrushTool;
  /** Disables toolbar interactions and unregisters NUI targets. */
  readonly disabled?: boolean;
  /** Tools marked as effectively used (displays `.tut-tool__tick` check badge). */
  readonly usedTools?: ReadonlySet<CanvasToolId> | readonly CanvasToolId[];
  /** Invoked when a tool button is triggered (NUI `point` pinch-hold or fallback click). */
  readonly onSelectTool?: (tool: CanvasToolId) => void;
  /** Optional callback for P4 Tutorial Card 3 integration. */
  readonly onToolUsed?: (tool: CanvasToolId) => void;
  /** Hold duration (ms) for NUI `point` targets; defaults to `HOLD_MS_DEFAULT` (1000 ms). */
  readonly holdMs?: number;
  /** Visual variant: `"canvas"` (right floating bar) or `"tutorial"` (Card 3 inline bar). */
  readonly variant?: ToolbarVariant;
  /** Hides toolbar smoothly during evaluating/sticker states. */
  readonly hidden?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

interface ToolButtonInnerProps {
  readonly tool: CanvasToolDefinition;
  readonly active: boolean;
  readonly used: boolean;
  readonly showTick: boolean;
  readonly disabled: boolean;
  readonly holdMs: number;
  readonly onActivate: (tool: CanvasToolId) => void;
}

function ToolButtonContent({
  tool,
  used,
  showTick,
}: {
  readonly tool: CanvasToolDefinition;
  readonly used: boolean;
  readonly showTick: boolean;
}) {
  const tickRef = useRef<HTMLSpanElement | null>(null);
  const wasUsedRef = useRef(false);

  useIsoLayoutEffect(() => {
    const el = tickRef.current;
    if (!showTick || !el) return;
    if (!used) {
      wasUsedRef.current = false;
      gsap.set(el, { scale: 0 });
      return;
    }
    if (wasUsedRef.current) return;
    wasUsedRef.current = true;
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(2.4)" });
    }, el);
    return () => ctx.revert();
  }, [showTick, used]);

  return (
    <>
      <span className="g" aria-hidden="true">
        <OwnerIcon name={tool.icon} size={26} />
      </span>
      <span className="nb-tool__label">{tool.label}</span>
      {showTick ? (
        <span
          ref={tickRef}
          className={`tut-tool__tick${used ? " is-used" : ""}`}
          data-used={used ? "true" : "false"}
          aria-hidden="true"
        >
          <OwnerIcon name="check" size={14} />
        </span>
      ) : null}
    </>
  );
}

function NuiToolButton({ tool, active, used, showTick, disabled, holdMs, onActivate }: ToolButtonInnerProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const resetRef = useRef<() => void>(() => undefined);

  const target = useNuiTarget(btnRef, {
    id: `r83-tool-${tool.id}`,
    label: tool.label,
    mode: "point",
    holdMs,
    disabled,
    badge: true,
    allowClickWhenNoHand: true,
    trackState: false,
    onFire: () => {
      onActivate(tool.id);
      resetRef.current();
    },
  });
  resetRef.current = target.reset;

  return (
    <button
      ref={btnRef}
      type="button"
      className={`nb-tool${active ? " is-active" : ""}`}
      data-t={tool.id}
      data-testid={`r83-tool-${tool.id}`}
      aria-label={tool.ariaLabel}
      aria-pressed={tool.kind === "mode" ? active : undefined}
      title={tool.title}
      disabled={disabled}
      onClick={() => onActivate(tool.id)}
    >
      <ToolButtonContent tool={tool} used={used} showTick={showTick} />
    </button>
  );
}

function PlainToolButton({
  tool,
  active,
  used,
  showTick,
  disabled,
  onActivate,
}: Omit<ToolButtonInnerProps, "holdMs">) {
  return (
    <button
      type="button"
      className={`nb-tool${active ? " is-active" : ""}`}
      data-t={tool.id}
      data-testid={`r83-tool-${tool.id}`}
      aria-label={tool.ariaLabel}
      aria-pressed={tool.kind === "mode" ? active : undefined}
      title={tool.title}
      disabled={disabled}
      onClick={() => onActivate(tool.id)}
    >
      <ToolButtonContent tool={tool} used={used} showTick={showTick} />
    </button>
  );
}

/**
 * Toolbar 5 alat kanvas r8.3 (`pencil`, `eraser`, `undo`, `redo`, `clear`).
 * Mode `point` (tunjuk lalu cubit via `useNuiTarget`) dengan target >= 64 px.
 */
export function Toolbar({
  activeTool,
  disabled = false,
  usedTools,
  onSelectTool,
  onToolUsed,
  holdMs = HOLD_MS_DEFAULT,
  variant = "canvas",
  hidden = false,
  className,
  testId = "r83-toolbar",
}: ToolbarProps) {
  const hasNui = useOptionalNui() !== null;
  const usedSet = usedTools instanceof Set ? usedTools : new Set(usedTools ?? []);
  const classes = [
    variant === "tutorial" ? "tut-tools" : "nb-toolbar draw-tools",
    hidden ? "is-hidden" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleActivate = (tool: CanvasToolId) => {
    if (disabled || hidden) return;
    onSelectTool?.(tool);
    onToolUsed?.(tool);
  };

  const showTick = variant === "tutorial";

  return (
    <div
      className={classes}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={CANVAS_COPY.toolbarAriaLabel}
      aria-hidden={hidden || undefined}
      data-testid={testId}
    >
      {CANVAS_TOOLS.map((tool) => {
        const active = tool.kind === "mode" && activeTool === tool.id;
        const used = showTick && usedSet.has(tool.id);
        return hasNui ? (
          <NuiToolButton
            key={tool.id}
            tool={tool}
            active={active}
            used={used}
            showTick={showTick}
            disabled={disabled || hidden}
            holdMs={holdMs}
            onActivate={handleActivate}
          />
        ) : (
          <PlainToolButton
            key={tool.id}
            tool={tool}
            active={active}
            used={used}
            showTick={showTick}
            disabled={disabled || hidden}
            onActivate={handleActivate}
          />
        );
      })}
    </div>
  );
}
