"use client";
import {useEffect,useRef,useState} from "react";
import type {LevelDefinition} from "@/src/domain/levels";
import type {HumanDecision,ObjectBehavior,DrawingInput} from "@/src/domain/types";
import type {GameController} from "@/src/game/game-controller";
import {isLegalPlacement} from "@/src/game/placement-rules";
export interface GameStageProps {
 level:LevelDefinition;behavior:ObjectBehavior;decision:HumanDecision;drawingInput:DrawingInput|null;
 phase:"falling"|"placing"|"gameplay"|"complete";
 onOutcomeReported(o:"success"|"fail"):void;onRedraw():void;onFallComplete():void;onCommitPlacement():void;onReposition():void;
}
const NEUTRAL={left:false,right:false,jump:false};
export function GameStage(props:GameStageProps){
 const latest=useRef(props);latest.current=props;
 const canvas=useRef<HTMLCanvasElement>(null),controller=useRef<GameController|null>(null);
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[outcome,setOutcome]=useState<"success"|"fail"|null>(null);
 const [position,setPosition]=useState(props.level.scene.gapStartX-10),[placementError,setPlacementError]=useState("");
 const [mode,setMode]=useState<"camera"|"fallback">("camera"),[status,setStatus]=useState("NUI NOT VERIFIED"),[trackingPaused,setTrackingPaused]=useState(false);
 const [retryKey,setRetryKey]=useState(0),[trackingReady,setTrackingReady]=useState(false);
 const paused=useRef(false),grab=useRef(false),keys=useRef({...NEUTRAL}),dragging=useRef(false);
 const currentMode=useRef(mode);currentMode.current=mode;
 const positionRef=useRef(position);positionRef.current=position;
 const {level,behavior,decision,drawingInput,phase}=props;
 function movePlacement(x:number){setPosition(x);positionRef.current=x;const valid=controller.current?.setPlacement(x)??false;setPlacementError(valid?"":"Posisi di luar dunia. Geser kembali; objekmu tetap disimpan.");}
 useEffect(()=>{
 let cancelled=false;let instance:GameController|null=null;setReady(false);setError("");
 void(async()=>{try{const {GameController}=await import("@/src/game/game-controller");if(cancelled||!canvas.current)return;instance=new GameController();controller.current=instance;
 await instance.mount(canvas.current,level,behavior,decision.finalLabel,drawingInput,
 o=>{if(!cancelled){keys.current={...NEUTRAL};setOutcome(o);}},
 ()=>{if(!cancelled)latest.current.onFallComplete();},()=>{if(!cancelled)latest.current.onCommitPlacement();},()=>{if(!cancelled)latest.current.onReposition();});
 if(cancelled){instance.unmount();return;}setReady(true);
 }catch(e){if(!cancelled)setError(e instanceof Error?e.message:String(e));}})();
 return()=>{cancelled=true;instance?.unmount();controller.current=null;};
 // The same classified object and world survive FALL, PLACE, PLAY and recovery.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[level.levelId,decision,behavior,drawingInput,retryKey]);
 useEffect(()=>{
 keys.current={...NEUTRAL};controller.current?.setInput(NEUTRAL);
 if(!ready||mode!=="fallback"||phase!=="gameplay"||outcome)return;
 const down=(e:KeyboardEvent)=>{if(["ArrowLeft","ArrowRight","KeyA","KeyD","Space"].includes(e.code))e.preventDefault();if(e.code==="ArrowLeft"||e.code==="KeyA")keys.current.left=true;if(e.code==="ArrowRight"||e.code==="KeyD")keys.current.right=true;controller.current?.setInput(keys.current);};
 const up=(e:KeyboardEvent)=>{if(e.code==="ArrowLeft"||e.code==="KeyA")keys.current.left=false;if(e.code==="ArrowRight"||e.code==="KeyD")keys.current.right=false;controller.current?.setInput(keys.current);};
 const stop=()=>{keys.current={...NEUTRAL};controller.current?.setInput(NEUTRAL);};
 window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",stop);
 return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",stop);stop();};
 },[ready,mode,phase,outcome]);
 useEffect(()=>{
 controller.current?.setInput(NEUTRAL);grab.current=false;
 if(!ready||mode!=="camera"||outcome||(phase!=="placing"&&phase!=="gameplay"))return;
 let cancelled=false;let driver:import("@/src/input/gameplay-hand-driver").GameplayHandDriver|null=null;
 void(async()=>{const {GameplayHandDriver}=await import("@/src/input/gameplay-hand-driver");if(cancelled)return;
 const video=document.querySelector<HTMLVideoElement>(".global-camera-host .camera-video");if(!video){setStatus("Kamera belum tersedia · NUI NOT VERIFIED");return;}
 driver=new GameplayHandDriver({video,onStatus:s=>{if(!cancelled)setStatus(s+" · NUI NOT VERIFIED");},onFrame:f=>{
 if(cancelled)return;setTrackingReady(f.tracked);
 if(!f.tracked){controller.current?.setInput(NEUTRAL);grab.current=false;if(latest.current.phase==="gameplay"){paused.current=true;setTrackingPaused(true);}return;}
 if(latest.current.phase==="gameplay"){controller.current?.setInput(paused.current?NEUTRAL:f.input);}
 else if(latest.current.phase==="placing"&&f.cursor){
 if(f.pinched){const x=f.cursor.x*800-(level.scene.gapWidth+20)/2;movePlacement(x);}grab.current=f.pinched;
 }
 }});await driver.start();if(cancelled)void driver.stop();})();
 return()=>{cancelled=true;void driver?.stop();controller.current?.setInput(NEUTRAL);};
 // The driver only routes frames to the currently exclusive PLACE/PLAY mode.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,mode,phase,outcome,retryKey]);
 const legal=isLegalPlacement(position,level.scene.gapWidth+20);
 function pointer(e:React.PointerEvent<HTMLCanvasElement>){if(phase!=="placing"||mode!=="fallback")return;const r=e.currentTarget.getBoundingClientRect();movePlacement((e.clientX-r.left)*800/r.width-(level.scene.gapWidth+20)/2);}
 function reposition(){setOutcome(null);controller.current?.reposition();setPosition(Number(canvas.current?.dataset.objectX??position));}
 return <section id="screen-gameplay" className="screen" data-testid="world-stage" style={{position:"relative",padding:"18px 20px 100px",maxWidth:1040,margin:"auto"}}>
 <h2>Halaman Sobek · Dunia Stickman</h2><p className="decision-chip">Keputusanmu: {decision.type.toUpperCase()} · “{decision.finalLabel}”{decision.type!=="override"?` (#${decision.sourceRank})`:""}</p>
 <p role="status" data-testid="input-status">{mode==="fallback"?"FALLBACK keyboard/pointer — BUKAN NUI TERVERIFIKASI":status}</p>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}><button className="btn" onClick={()=>{controller.current?.setInput(NEUTRAL);setMode(mode==="camera"?"fallback":"camera");paused.current=false;setTrackingPaused(false);}}>{mode==="camera"?"Gunakan FALLBACK keyboard/pointer":"Coba NUI kamera"}</button><button className="btn" onClick={props.onRedraw}>Gambar ulang (recovery)</button></div>
 <p data-testid="world-phase">{phase==="falling"?"FALL_ANIMATION · karya turun; collider belum aktif":phase==="placing"?"PLACE · geser objek, lalu konfirmasi penempatan":"PLAY · gerakkan Stickman hingga menyentuh bendera goal"}</p>
 <canvas ref={canvas} width={800} height={380} className="game-canvas" data-testid="game-canvas" aria-label="Dunia Stickman 2D" style={{width:"100%",height:"auto",display:"block",touchAction:"none"}}
 onPointerDown={e=>{if(mode!=="fallback"||phase!=="placing")return;dragging.current=true;e.currentTarget.setPointerCapture(e.pointerId);pointer(e);}}
 onPointerMove={e=>{if(dragging.current)pointer(e);}} onPointerUp={()=>{dragging.current=false;}} onPointerCancel={()=>{dragging.current=false;}}/>
 {error&&<div role="alert">Runtime gagal: {error}<button onClick={()=>setRetryKey(x=>x+1)}>Coba Lagi</button></div>}
 {phase==="placing"&&!error&&<div data-testid="placement-controls"><label>Posisi objek horizontal <input data-testid="placement-slider" aria-label="Posisi objek horizontal" type="range" min={-200} max={800} value={position} onChange={e=>movePlacement(Number(e.target.value))}/></label>
 <p role="alert">{placementError}</p><button className="btn btn-primary" data-testid="btn-confirm-placement" disabled={!ready||!legal} onClick={()=>{if(!controller.current?.commitPlacementAt(position))setPlacementError("Penempatan tidak legal. Objek tidak hilang.");}}>Konfirmasi Posisi</button></div>}
 {phase==="gameplay"&&!outcome&&<div><button className="btn" data-testid="btn-reposition" onClick={reposition}>Geser Ulang Objek</button>
 {mode==="fallback"&&<div aria-label="Kontrol FALLBACK">{["left","right"].map(dir=><button key={dir} className="btn" data-testid={`move-${dir}`} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);controller.current?.setInput({...NEUTRAL,[dir]:true});}} onPointerUp={()=>controller.current?.setInput(NEUTRAL)} onPointerCancel={()=>controller.current?.setInput(NEUTRAL)}>{dir==="left"?"Kiri":"Kanan"}</button>)}</div>}</div>}
 {trackingPaused&&mode==="camera"&&phase==="gameplay"&&!outcome&&<div role="alert">Tracking hilang, Stickman berhenti.<button className="btn" disabled={!trackingReady} onClick={()=>{paused.current=false;setTrackingPaused(false);}}>Lanjut setelah tracking pulih</button></div>}
 {outcome&&<div data-testid="outcome-overlay" role="status"><h3 className="overlay-title">{outcome==="success"?"Berhasil menyeberang!":"Gagal · kembali ke checkpoint"}</h3>
 {outcome==="success"?<button className="btn" data-testid="btn-next" onClick={()=>props.onOutcomeReported("success")}>Lihat ringkasan</button>:<><button className="btn" data-testid="btn-retry-cycle" onClick={()=>{controller.current?.retry();setOutcome(null);}}>Coba dari checkpoint</button><button className="btn" data-testid="btn-reposition" onClick={reposition}>Reposisi objek yang sama</button></>}</div>}
 </section>;
}
