export function isLegalPlacement(x:number,width:number):boolean {return Number.isFinite(x)&&x>=0&&x+width<=800;}
export function worldOutcome(s:{phase:string;x:number;y:number;goal:number;grounded:boolean;hazard:boolean}):"success"|"fail"|null {
 if(s.phase!=="gameplay")return null;
 if(s.hazard||s.y>460)return "fail";
 return s.x>=s.goal && s.x<=s.goal+28 && s.grounded ? "success":null;
}
