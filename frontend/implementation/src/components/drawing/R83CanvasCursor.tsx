"use client";
import {createPortal} from "react-dom";
import {useHandCursor} from "../../hooks/useHandCursor";
import {useInputMode} from "../../hooks/useHandGesture";
export function R83CanvasCursor({enabled,erasing,radius}:{enabled:boolean;erasing:boolean;radius:number}){
 const mode=useInputMode(),s=useHandCursor();
 if(!enabled||mode!=="camera"||!s?.cursor||typeof document==="undefined")return null;
 const x=s.cursor.x*innerWidth,y=s.cursor.y*innerHeight;
 const el=document.elementFromPoint(x,y);
 if(!el?.matches("canvas.draw-canvas,canvas.tut-draw__canvas"))return null;
 return createPortal(<span className={`r83-pen-cursor${erasing?" erase":""}${s.pinch?" down":""}`} style={{left:x,top:y,width:erasing?radius*2:36,height:erasing?radius*2:36}} aria-hidden="true">
 <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
 {erasing?<><path d="M27.3 11.2a4 4 0 0 1 5.7 0l4.8 4.8a4 4 0 0 1 0 5.7L22.5 37a4 4 0 0 1-5.7 0l-4.8-4.8a4 4 0 0 1 0-5.7l15.3-15.3Z"/><path d="m20 18.5 10.5 10.5"/><path d="M10 38h7.5"/></>:<><path d="M32.5 9.8a3.2 3.2 0 0 1 4.5 0l1.2 1.2a3.2 3.2 0 0 1 0 4.5L17.8 36 9.5 38.5l2.5-8.3L32.5 9.8Z"/><path d="m28.5 13.8 5.7 5.7"/><path d="m25.5 16.8 5.7 5.7"/></>}
 </svg></span>,document.body);
}
