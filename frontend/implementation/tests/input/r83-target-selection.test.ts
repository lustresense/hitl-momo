import { describe,it,expect } from "vitest";
import { chooseTarget,isDrag,type Candidate } from "../../src/input/r83/target-selection";
const rect=(left:number,top=0)=>({left,top,right:left+40,bottom:top+40,width:40,height:40});
const a: Candidate<string>={id:"a",mode:"any",rect:rect(0)};
const b: Candidate<string>={id:"b",mode:"any",rect:rect(100)};
const d: Candidate<string>={id:"d",mode:"point",rect:rect(200)};
describe("R8.3 target selection",()=>{
  it("A selects the only target anywhere",()=>expect(chooseTarget([a],{x:800,y:800})).toBe("a"));
  it("B chooses nearest target",()=>expect(chooseTarget([a,b],{x:120,y:20})).toBe("b"));
  it("D requires pointing inside",()=>{expect(chooseTarget([d],{x:100,y:20})).toBeNull();expect(chooseTarget([d],{x:210,y:20})).toBe("d");});
  it("movement >26px is a drag",()=>{expect(isDrag({x:0,y:0},{x:26,y:0})).toBe(false);expect(isDrag({x:0,y:0},{x:27,y:0})).toBe(true);});
});
