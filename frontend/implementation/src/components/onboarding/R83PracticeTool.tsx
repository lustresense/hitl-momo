"use client";
import {useRef} from "react";
import {useDwell} from "@/src/hooks/useDwell";
import {R83ToolIcon,type R83Tool} from "../drawing/R83ToolIcon";
import {Icon} from "../ui/Icon";
type ToolId="draw"|"erase"|"undo"|"redo"|"clear";
const icons:Record<ToolId,R83Tool>={draw:"pencil",erase:"eraser",undo:"undo",redo:"redo",clear:"clear"};
export function R83PracticeTool({id,label,aria,active,used,enabled,onSelect}:{id:ToolId;label:string;aria:string;active:boolean;used:boolean;enabled:boolean;onSelect:()=>void}){
 const ref=useRef<HTMLButtonElement>(null);
 const {mode}=useDwell({ref,onActivate:onSelect,dwellMs:1,targetMode:"point",enabled});
 return <button ref={ref} type="button" disabled={!enabled} className={`nb-tool tut-tool${active?" is-active":""}${used?" is-used":""}`} data-tool={id} aria-label={aria} aria-pressed={id==="draw"||id==="erase"?active:undefined} onClick={()=>{if(mode==="fallback")onSelect()}}>
 <R83ToolIcon name={icons[id]}/><span className="nb-tool__label">{label}</span><span className="tut-tool__tick" aria-hidden="true"><Icon name="check" size={12} stroke={4}/></span></button>
}