/** One camera-driven confirmation loop for all mounted R8.3 targets. */
import { getHandCursor } from "../../camera/hand-cursor-store";
import { getInputMode } from "../input-mode";
import { chooseTarget, isDrag, RING_DRAIN, type Point, type TargetMode, type Candidate } from "./target-selection";

interface Target {
  element: () => HTMLElement | null;
  mode: TargetMode;
  holdMs: number;
  progress: (value: number) => void;
  fire: () => void;
  value: number;
  registered: number;
}
const targets = new Set<Target>();
let raf = 0, last = 0;
let armed = false, down = false, moved = false;
let origin: Point | null = null, locked: Target | null = null;
function cancel() {
  armed = false; down = false; moved = false; origin = null; locked = null;
  for (const t of targets) {
    t.value = 0; t.progress(0);
    t.element()?.classList.remove("r83-nui-lit","r83-nui-dim","r83-nui-holding");
  }
}
function candidates(): Candidate<Target>[] {
  const result: Candidate<Target>[] = [];
  for (const t of targets) {
    const el = t.element();
    if (!el?.isConnected || el.closest('[hidden],[aria-hidden="true"],[inert]')) continue;
    if (el instanceof HTMLButtonElement && el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right<=0 || r.bottom<=0 || r.left>=innerWidth || r.top>=innerHeight || getComputedStyle(el).visibility !== "visible") continue;
    // Ignore elements covered by another screen or modal. Offscreen targets are not active.
    const x = Math.max(0, Math.min(innerWidth-1,r.left+r.width/2));
    const y = Math.max(0, Math.min(innerHeight-1,r.top+r.height/2));
    const top = document.elementFromPoint?.(x,y);
    if (top && !el.contains(top) && !top.contains(el)) continue;
    result.push({id:t,mode:t.mode,rect:r});
  }
  return result;
}
function tick(now: number) {
  const dt = last ? Math.max(0, Math.min(50,now-last)) : 0; last=now;
  const sample = getHandCursor();
  if (document.hidden || getInputMode() !== "camera" || !sample?.cursor) {
    cancel();
  } else {
    const p = {x:sample.cursor.x*innerWidth,y:sample.cursor.y*innerHeight};
    const active = candidates();
    const pinching = sample.pinch === true || sample.pose === "pinch";
    if (!pinching) { armed=true; down=false; moved=false; origin=null; locked=null; }
    else if (!down) {
      down=true; origin=p;
      locked=armed ? chooseTarget(active.filter(t=>now-t.id.registered>=30),p) : null;
      armed=false;
    }
    if (origin && isDrag(origin,p)) { moved=true; locked=null; }
    if (locked && !active.some(t=>t.id===locked)) locked=null;
    const lit = down ? locked : chooseTarget(active,p);
    let fire: Target | null = null;
    for (const t of targets) {
      const activeTarget = active.some(a=>a.id===t);
      const holding = activeTarget && t===locked && down && !moved;
      const el=t.element();
      el?.classList.toggle("r83-nui-lit",activeTarget && t===lit && t.mode==="any");
      el?.classList.toggle("r83-nui-dim",activeTarget && lit!==null && t!==lit && t.mode==="any");
      el?.classList.toggle("r83-nui-holding",holding);
      const next = holding ? Math.min(1,t.value+dt/t.holdMs) : Math.max(0,t.value-dt/t.holdMs*RING_DRAIN);
      if (next!==t.value) { t.value=next; t.progress(next); }
      if (holding && next===1) { fire=t; locked=null; }
    }
    if (fire) fire.fire();
  }
  if (targets.size) raf=requestAnimationFrame(tick); else { raf=0; last=0; }
}
export function registerPinchTarget(options: Omit<Target,"value"|"registered">): () => void {
  const target: Target={...options,value:0,registered:performance.now()};
  targets.add(target);
  if (!raf) { last=0; raf=requestAnimationFrame(tick); window.addEventListener("blur",cancel); }
  return () => {
    targets.delete(target);
    target.element()?.classList.remove("r83-nui-lit","r83-nui-dim","r83-nui-holding");
    if (locked===target) locked=null;
    if (!targets.size) { cancelAnimationFrame(raf); raf=0; last=0; cancel(); window.removeEventListener("blur",cancel); }
  };
}
