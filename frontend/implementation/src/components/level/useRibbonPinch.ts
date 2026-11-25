"use client";
import {useEffect,useRef,type RefObject} from "react";
import {subscribeHandCursor} from "../../camera/hand-cursor-store";
interface Callbacks {begin:(y:number,id:number)=>void;move:(y:number,id:number)=>void;end:(id:number,cancelled:boolean)=>void}
export function useRibbonPinch(ref:RefObject<HTMLButtonElement>,enabled:boolean,callbacks:Callbacks){
 const latest=useRef(callbacks);latest.current=callbacks;
 useEffect(()=>{
  if(!enabled)return;
  const id=-83;let armed=false,down=false,grab=false;
  const clear=()=>{if(grab)latest.current.end(id,true);grab=false;armed=false;down=false;ref.current?.classList.remove("r83-ribbon-lit");};
  const off=subscribeHandCursor(sample=>{
   const el=ref.current;if(!el||!sample?.cursor||document.hidden){clear();return;}
   const x=sample.cursor.x*innerWidth,y=sample.cursor.y*innerHeight,pinch=sample.pinch===true||sample.pose==="pinch";
   const shelf=el.closest(".bm-shelf");const all=Array.from(shelf?.querySelectorAll<HTMLButtonElement>(".bm-ribbon")??[]);
   const nearest=all.reduce<HTMLButtonElement|null>((best,b)=>{const r=b.getBoundingClientRect();const d=Math.abs(x-r.left-r.width/2);if(!best)return b;const q=best.getBoundingClientRect();return d<Math.abs(x-q.left-q.width/2)?b:best;},null);
   if(!down)el.classList.toggle("r83-ribbon-lit",nearest===el);
   if(!pinch){if(grab)latest.current.end(id,false);grab=false;down=false;armed=true;return;}
   if(!down){down=true;grab=armed&&nearest===el;armed=false;if(grab)latest.current.begin(y,id);}
   if(grab)latest.current.move(y,id);
  });
  window.addEventListener("blur",clear);
  return()=>{off();clear();window.removeEventListener("blur",clear);};
 },[ref,enabled]);
}
