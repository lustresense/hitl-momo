"use client";
import {useEffect,useRef} from "react";
import {subscribeHandCursor} from "../camera/hand-cursor-store";
export function useR83Flick(enabled:boolean,onFlick:()=>void){
 const latest=useRef(onFlick);latest.current=onFlick;
 useEffect(()=>{if(!enabled)return;let armed=false,down=false,fired=false;let hist:{t:number;y:number}[]=[];
 return subscribeHandCursor(s=>{if(!s?.cursor||document.hidden){armed=false;down=false;hist=[];return;}
 const pinch=s.pinch===true||s.pose==="pinch";
 if(!pinch){armed=true;down=false;hist=[];fired=false;return;}
 if(!down){down=true;fired=!armed;armed=false;hist=[];}
 if(fired)return;const t=performance.now(),y=s.cursor.y*innerHeight;hist.push({t,y});hist=hist.filter(h=>t-h.t<=140);
 if(hist.length>1&&hist[0].y-y>40){fired=true;latest.current();}
 });
 },[enabled]);
}
