"use client";
/** R8.3: camera pinch-hold replaces hover dwell; public hook name kept for existing screens. */
import { useEffect, useRef, useState, type RefObject } from "react";
import { acquireThumbTracker } from "../camera/thumb-tracker";
import type { InputMode } from "../input/input-mode";
import { useInputMode } from "./useHandGesture";
import { useHandReaderLive } from "./useHandCursor";
import { registerPinchTarget } from "../input/r83/pinch-targets";
import type { TargetMode } from "../input/r83/target-selection";

export const DEFAULT_DWELL_MS = 1000;
export const DWELL_DRAIN_RATIO = 1.5;
export const TRACKER_START_GRACE_MS = 300;
export interface UseDwellOptions {
  ref: RefObject<HTMLElement>;
  onActivate: () => void;
  dwellMs?: number;
  enabled?: boolean;
  targetMode?: TargetMode;
}
export interface DwellState { mode: InputMode; progress: number }
export function useDwell({ref,onActivate,dwellMs=DEFAULT_DWELL_MS,enabled=true,targetMode="any"}: UseDwellOptions): DwellState {
  const mode=useInputMode(), readerLive=useHandReaderLive();
  const active=enabled && mode==="camera";
  const callback=useRef(onActivate); callback.current=onActivate;
  const [progress,setProgress]=useState(0);
  useEffect(()=>{
    if (!active || readerLive) return;
    let release: (()=>void)|null=null;
    const timer=setTimeout(()=>{release=acquireThumbTracker();},TRACKER_START_GRACE_MS);
    return ()=>{clearTimeout(timer);release?.();};
  },[active,readerLive]);
  useEffect(()=>{
    setProgress(0);
    if (!active) return;
    return registerPinchTarget({element:()=>ref.current,mode:targetMode,holdMs:dwellMs,
      progress:value=>setProgress(Math.round(value*100)/100),fire:()=>callback.current()});
  },[active,ref,targetMode,dwellMs]);
  return {mode,progress:active?progress:0};
}
