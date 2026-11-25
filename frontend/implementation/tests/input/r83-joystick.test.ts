import { describe,it,expect } from "vitest";
import { PinchJoystick } from "../../src/input/r83/pinch-joystick";
describe("R8.3 pinch joystick",()=>{
  it("requires open hand first and stops on release",()=>{
    const j=new PinchJoystick();expect(j.feed({x:20,y:20},true,0).speed).toBe(0);
    j.feed({x:20,y:20},false,10);j.feed({x:20,y:20},true,20);
    expect(j.feed({x:90,y:20},true,50).right).toBe(true);
    expect(j.feed({x:90,y:20},false,60).right).toBe(false);
  });
  it("quick tap jumps, lost hand never jumps",()=>{
    const j=new PinchJoystick();j.feed({x:0,y:0},false,0);j.feed({x:0,y:0},true,10);
    expect(j.feed({x:0,y:0},false,100).jump).toBe(true);
    j.feed({x:0,y:0},true,120);expect(j.feed(null,false,140).jump).toBe(false);
  });
  it("upward flick jumps",()=>{
    const j=new PinchJoystick();j.feed({x:20,y:80},false,0);j.feed({x:20,y:80},true,10);
    expect(j.feed({x:20,y:30},true,70).jump).toBe(true);
  });
});
