/** R8.3 five drawing tools: select by pointing and pinching, mouse only in fallback. */
import { useRef } from "react";
import { useDwell } from "../../hooks/useDwell";
import { R83ToolIcon, type R83Tool } from "./R83ToolIcon";

interface ToolProps { icon:R83Tool; label:string; enabled:boolean; active?:boolean; onActivate:()=>void }
function Tool({icon,label,enabled,active,onActivate}:ToolProps) {
  const ref=useRef<HTMLButtonElement>(null);
  const {mode}=useDwell({ref,onActivate,enabled,targetMode:"point",dwellMs:1});
  return <button ref={ref} type="button" className={`tool-btn nb-tool${active?" is-active":""}`}
    aria-label={label} aria-pressed={active} disabled={!enabled}
    onClick={()=>{if(mode==="fallback"&&enabled)onActivate();}}>
    <R83ToolIcon name={icon}/><span className="nb-tool__label">{label}</span>
  </button>;
}
export interface DrawingToolbarProps {
  enabled:boolean; erasing:boolean; onErasingChange:(on:boolean)=>void;
  onUndo:()=>void; onRedo:()=>void; onClear?:()=>void;
  eraserSize?:number; onEraserSizeChange?:(cssPx:number)=>void;
}
export function DrawingToolbar({enabled,erasing,onErasingChange,onUndo,onRedo,onClear}:DrawingToolbarProps){
  return <aside className={`nb-toolbar${enabled?"":" is-idle"}`} role="toolbar" aria-label="Alat menggambar">
    <Tool icon="pencil" label="Pensil" enabled={enabled} active={!erasing} onActivate={()=>onErasingChange(false)}/>
    <Tool icon="eraser" label="Hapus" enabled={enabled} active={erasing} onActivate={()=>onErasingChange(true)}/>
    <Tool icon="undo" label="Mundur" enabled={enabled} onActivate={onUndo}/>
    <Tool icon="redo" label="Maju" enabled={enabled} onActivate={onRedo}/>
    {onClear&&<Tool icon="clear" label="Bersihkan" enabled={enabled} onActivate={onClear}/>}
  </aside>;
}
