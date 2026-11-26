"use client";

import { useEffect, useMemo, useRef } from "react";
import type { DragRelative } from "../core";
import { useNui } from "./NuiProvider";

export interface UseDragRelativeOptions {
  enabled?: boolean;
  threshold?: number;
  ignore?: string;
  when?: () => boolean;
  onStart?: () => void;
  onMove?: (dx: number, dy: number) => void;
  onEnd?: () => void;
}

export interface UseDragRelativeHandle {
  dragging(): boolean;
}

/** Hook wrapper tarik relatif (aturan C, ambang default 12 px). Nol state per frame. */
export function useDragRelative(options: UseDragRelativeOptions = {}): UseDragRelativeHandle {
  const controller = useNui();
  const { enabled = true, threshold, ignore } = options;

  const onStartRef = useRef(options.onStart);
  onStartRef.current = options.onStart;
  const onMoveRef = useRef(options.onMove);
  onMoveRef.current = options.onMove;
  const onEndRef = useRef(options.onEnd);
  onEndRef.current = options.onEnd;
  const whenRef = useRef(options.when);
  whenRef.current = options.when;
  const dragRef = useRef<DragRelative | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const handle = controller.dragRelative({
      threshold,
      ignore,
      when: () => (whenRef.current ? whenRef.current() : true),
      onStart: () => onStartRef.current?.(),
      onMove: (dx, dy) => onMoveRef.current?.(dx, dy),
      onEnd: () => onEndRef.current?.(),
    });
    dragRef.current = handle;
    return () => {
      handle.destroy();
      if (dragRef.current === handle) dragRef.current = null;
    };
  }, [controller, enabled, threshold, ignore]);

  return useMemo<UseDragRelativeHandle>(
    () => ({
      dragging: () => dragRef.current?.dragging() ?? false,
    }),
    [],
  );
}
