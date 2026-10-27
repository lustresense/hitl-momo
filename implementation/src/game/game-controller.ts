import type {LevelContext,ObjectBehavior,DrawingInput} from "../domain/types";
import type {KaplayGameHandle} from "./kaplay-runtime";
export class GameController {
 private handle:KaplayGameHandle|null=null;private generation=0;
 async mount(canvas:HTMLCanvasElement,level:LevelContext,behavior:ObjectBehavior,finalLabel:string,drawingInput:DrawingInput|null,onOutcome:(o:"success"|"fail")=>void,onFallComplete:()=>void,onCommitPlacement:()=>void,onReposition:()=>void){
 this.unmount();const generation=this.generation;const {createKaplayGame}=await import("./kaplay-runtime");if(this.generation!==generation)return;
 const handle=await createKaplayGame({canvas,level,behavior,finalLabel,drawingInput,onOutcome,onFallComplete,onCommitPlacement,onReposition});if(this.generation!==generation){handle.destroy();return;}this.handle=handle;
 }
 setInput(i:{left:boolean;right:boolean;jump:boolean}){this.handle?.setInput(i);}
 onFallComplete(){this.handle?.onFallComplete();}
 setPlacement(x:number,y:number=320):boolean{return this.handle?.setPlacement(x,y)??false;}
 commitPlacementAt(x:number,y:number=320):boolean{return this.handle?.commitPlacementAt(x,y)??false;}
 retry(){this.handle?.retry();}reposition(){this.handle?.reposition();}
 unmount(){this.generation++;this.handle?.destroy();this.handle=null;}
}
