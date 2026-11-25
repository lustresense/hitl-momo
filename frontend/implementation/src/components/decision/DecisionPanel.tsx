"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {DrawingInput,LevelContext,PredictionResult} from "@/src/domain/types";
import {actionFor,MODE_TOP3_ALTERNATIVES} from "@/src/input/gesture-mode";
import type {HandPose} from "@/src/input/hand-gesture";
import {generateSketchDataUri} from "@/src/game/sketch-renderer";
import {R83Target} from "../ui/R83Target";
import "./r83-guess.css";
export interface DecisionPanelProps {prediction:PredictionResult;level:LevelContext;drawingInput?:DrawingInput|null;onAccept():void;onCorrect(rank:2|3):void;onOverride(label:string):void;onRedraw():void}
export const OVERRIDE_HOLD_MS=1000;
export const COMMIT_HOLD_MS=2000;
export const MAX_OVERRIDE_CHOICES=4;
const NOT_A_COUNT: ReadonlySet<HandPose> = new Set<HandPose>(["thumb-up", "pinch", "fist", "none"]);

/**
 * The label (1..4) the hand shows in the open list, or null. One to three fingers come from the pose through the
 * router: the raw count includes the thumb, so a count of 1 can be a thumbs-up. Four has no pose of its own, so it
 * is read from the count, and only for a pose that no other action claims.
 */
export function listChoiceFor(pose: HandPose, fingerCount: number): 1 | 2 | 3 | 4 | null {
  const picked = actionFor(MODE_TOP3_ALTERNATIVES, pose);
  if (picked === "choose-1") return 1;
  if (picked === "choose-2") return 2;
  if (picked === "choose-3") return 3;
  if (NOT_A_COUNT.has(pose)) return null;
  return fingerCount === 4 ? 4 : null;
}


export function DecisionPanel({prediction,level,drawingInput=null,onAccept,onCorrect,onOverride,onRedraw}:DecisionPanelProps){
 const [other,setOther]=useState(false),[locked,setLocked]=useState(false);
 const committed=useRef(false);
 useEffect(()=>{committed.current=false;setLocked(false);setOther(false)},[prediction]);
 const choices=useMemo(()=>level.vocabulary.filter(v=>!prediction.candidates.some(c=>c.label===v)).slice(0,MAX_OVERRIDE_CHOICES),[level.vocabulary,prediction]);
 const commit=(action:()=>void)=>{if(committed.current)return;committed.current=true;setLocked(true);action()};
 const thumb=generateSketchDataUri(drawingInput,{width:96,height:96,behavior:"neutral",frame:"none"});
 return <>
 <div className="g-body"><div className="g-thumb fc"><img src={thumb} alt="Gambarmu"/></div><div className="t3" role="group" aria-label="Tiga tebakan teratas">
 {prediction.candidates.map((c,k)=>{const pct=Math.round(c.confidence*100);return <R83Target key={k} className="t3-row pick" testId={k===0?"btn-accept":`btn-correct-${k+1}`} holdMs={COMMIT_HOLD_MS} disabled={other||locked} onConfirm={()=>commit(k===0?onAccept:()=>onCorrect((k+1) as 2|3))} label={`${k+1}. ${c.label}, ${pct}%`}>
 <span className="t3-rank">{k+1}</span><span className="t3-name">{c.label}</span><span className="t3-pct">{pct}%</span><span className="t3-bar"><i style={{width:`${pct}%`}}/></span></R83Target>})}
 </div></div>
 {other&&<div className="g-other" data-testid="override-picker"><p>Benda lain di level ini:</p><div className="g-other-grid">{choices.length?choices.map(v=><R83Target key={v} className="nb-btn" testId={`override-option-${v}`} disabled={locked} holdMs={COMMIT_HOLD_MS} onConfirm={()=>commit(()=>onOverride(v))}>{v}</R83Target>):<span className="k-chip">Tidak ada benda lain di level ini.</span>}</div></div>}
 <div className="g-actions"><R83Target className="nb-btn" testId={other?"btn-override-back":"btn-override"} disabled={locked} holdMs={OVERRIDE_HOLD_MS} onConfirm={()=>setOther(v=>!v)}>{other?"Kembali":"Bukan ini, pilih lainnya"}</R83Target><R83Target className="nb-btn ghost" testId="btn-redraw" disabled={locked} holdMs={1000} onConfirm={()=>commit(onRedraw)}>Gambar lagi</R83Target></div>
 </>;
}
