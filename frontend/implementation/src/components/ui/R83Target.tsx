"use client";
import {useRef,useEffect,type ReactNode} from "react";
import {useDwell} from "../../hooks/useDwell";
import {getInputMode} from "../../input/input-mode";
import {Icon} from "./Icon";
interface Props {children:ReactNode;onConfirm:()=>void;holdMs:number;disabled?:boolean;className?:string;testId?:string;label?:string;mode?:"any"|"point"}
export function R83Target({children,onConfirm,holdMs,disabled=false,className="",testId,label,mode="any"}:Props){
 const ref=useRef<HTMLButtonElement>(null), held=useRef<number|null>(null), latest=useRef(onConfirm);
 latest.current=onConfirm;
 const {mode:input,progress}=useDwell({ref,onActivate:onConfirm,dwellMs:holdMs,enabled:!disabled,targetMode:mode});
 const cancel=()=>{if(held.current!==null)window.clearTimeout(held.current);held.current=null;};
 useEffect(()=>cancel,[input,disabled]);
 const start=()=>{if(getInputMode()!=="fallback"||disabled||held.current!==null)return;held.current=window.setTimeout(()=>{held.current=null;if(getInputMode()==="fallback")latest.current();},holdMs);};
 return <button ref={ref} type="button" className={className+" r83-target"} data-testid={testId} data-progress={Math.round(progress*100)} data-hold-ms={holdMs} disabled={disabled} aria-label={label} onPointerDown={start} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onBlur={cancel} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();if(!e.repeat)start();}}} onKeyUp={cancel}>
 {children}
 {input==="camera"&&<span className="nui-badge" aria-hidden="true"><svg viewBox="0 0 40 40"><circle className="t" cx="20" cy="20" r="17"/><circle className="f" cx="20" cy="20" r="17" strokeDasharray={2*Math.PI*17} strokeDashoffset={2*Math.PI*17*(1-progress)} transform="rotate(-90 20 20)"/></svg><span className="i"><Icon name="gesture-pinch" size={20}/></span></span>}
 </button>;
}
