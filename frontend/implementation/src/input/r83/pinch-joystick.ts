/** R8.3 rule C from shared/hand.js: anchored pinch, quick tap or upward flick jumps. */
import type { Point } from "./target-selection";
export interface JoystickReading { left:boolean;right:boolean;jump:boolean;speed:number }
const neutral=():JoystickReading=>({left:false,right:false,jump:false,speed:0});
export class PinchJoystick {
  private anchor: (Point&{at:number})|null=null;
  private armed=false;
  private moved=false;
  private history:{at:number;y:number}[]=[];
  private lastFlick=-Infinity;
  reset(){this.anchor=null;this.armed=false;this.moved=false;this.history=[];this.lastFlick=-Infinity;}
  feed(p:Point|null,pinched:boolean,now:number):JoystickReading {
    if(!p){this.reset();return neutral();}
    if(!pinched){
      const jump=!!this.anchor&&!this.moved&&now-this.anchor.at<230;
      this.anchor=null;this.armed=true;this.history=[];
      return {...neutral(),jump};
    }
    if(!this.anchor){
      if(!this.armed)return neutral();
      this.anchor={...p,at:now};this.armed=false;this.moved=false;this.history=[];
    }
    const dx=p.x-this.anchor.x,dy=p.y-this.anchor.y;
    if(Math.hypot(dx,dy)>10)this.moved=true;
    this.history.push({at:now,y:p.y});
    this.history=this.history.filter(h=>now-h.at<=140);
    const jump=this.history.length>1&&this.history[0].y-p.y>40&&now-this.lastFlick>420;
    if(jump){this.history=[];this.lastFlick=now;}
    const speed=Math.abs(dx)<14?0:Math.min(1,.35+(Math.abs(dx)-14)/110*.65);
    return {left:speed>0&&dx<0,right:speed>0&&dx>0,jump,speed};
  }
}
