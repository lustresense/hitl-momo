/* Freehand canvas: pen, partial eraser, undo/redo, grouping into separate objects */
(function(){
'use strict';
window.SU=window.SU||{};
class Sketch{
 constructor(host,cb){this.host=host;this.cb=cb||{};this.cv=document.createElement('canvas');host.appendChild(this.cv);this.cur=document.createElement('div');this.cur.className='sk-cursor';host.appendChild(this.cur);
  this.strokes=[];this.hist=[[]];this.hi=0;this.act=null;this.down=false;this.erasing=false;this.eraseHit=false;this.last=0;this.toolErase=false;this.resize();this.bind();}
 static eKey=false;
 resize(){const r=this.host.getBoundingClientRect();const d=Math.min(2,devicePixelRatio||1);this.w=r.width;this.h=r.height;this.d=d;this.cv.width=Math.max(1,Math.round(r.width*d));this.cv.height=Math.max(1,Math.round(r.height*d));this.draw();}
 pt(e){const r=this.cv.getBoundingClientRect(),sx=r.width?this.w/r.width:1,sy=r.height?this.h/r.height:1;return{x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy};}
 cursor(p,erase,down){this.cur.style.transform=`translate(${p.x}px,${p.y}px)`;this.cur.classList.add('show');this.cur.classList.toggle('erase',!!erase);this.cur.classList.toggle('down',!!down);}
 isErase(e){return this.toolErase||Sketch.eKey||(e&&e.button===2);}
 bind(){
  const c=this.cv;
  c.addEventListener('contextmenu',e=>e.preventDefault());
  c.addEventListener('pointerdown',e=>{e.preventDefault();c.setPointerCapture(e.pointerId);const p=this.pt(e);this.down=true;this.last=performance.now();this.erasing=this.isErase(e);
   if(this.erasing){this.eraseHit=false;this.eraseAt(p);}else this.act=[p];this.cursor(p,this.erasing,true);this.draw();if(this.cb.onStart)this.cb.onStart(this.erasing?'erase':'draw');});
  c.addEventListener('pointermove',e=>{const p=this.pt(e);this.cursor(p,this.down?this.erasing:this.isErase(),this.down);if(!this.down)return;this.last=performance.now();
   if(this.erasing)this.eraseAt(p);else{const l=this.act[this.act.length-1];if(Math.hypot(p.x-l.x,p.y-l.y)>2.2)this.act.push(p);}this.draw();});
  const up=()=>{if(!this.down)return;this.down=false;this.last=performance.now();
   if(this.erasing){if(this.eraseHit)this.commit('erase');}
   else if(this.act&&this.act.length>=2){this.strokes.push(this.dens(this.act));this.commit('stroke');}
   this.act=null;this.erasing=false;this.draw();this.cur.classList.remove('down');};
  c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
  c.addEventListener('pointerleave',()=>{if(!this.down)this.cur.classList.remove('show');});
 }
 dens(s){const o=[s[0]];for(let i=1;i<s.length;i++){const a=o[o.length-1],b=s[i],d=Math.hypot(b.x-a.x,b.y-a.y);const n=Math.ceil(d/5);for(let k=1;k<=n;k++)o.push({x:a.x+(b.x-a.x)*k/n,y:a.y+(b.y-a.y)*k/n});}return o;}
 eraseAt(p){const R=22,out=[];let hit=false;
  for(const s of this.strokes){let run=[];for(const q of s){if(Math.hypot(q.x-p.x,q.y-p.y)<=R){hit=true;if(run.length>=2)out.push(run);run=[];}else run.push(q);}if(run.length>=2)out.push(run);}
  if(hit){this.strokes=out;this.eraseHit=true;}
 }
 clone(){return this.strokes.map(s=>s.map(p=>({x:p.x,y:p.y})));}
 commit(kind){this.hist=this.hist.slice(0,this.hi+1);this.hist.push(this.clone());this.hi++;if(this.cb.onChange)this.cb.onChange(kind);}
 undo(){if(this.hi<=0)return false;this.hi--;this.strokes=this.hist[this.hi].map(s=>s.map(p=>({...p})));this.draw();if(this.cb.onChange)this.cb.onChange('undo');return true;}
 redo(){if(this.hi>=this.hist.length-1)return false;this.hi++;this.strokes=this.hist[this.hi].map(s=>s.map(p=>({...p})));this.draw();if(this.cb.onChange)this.cb.onChange('redo');return true;}
 draw(){const ctx=this.cv.getContext('2d');if(!ctx)return;ctx.setTransform(this.d,0,0,this.d,0,0);ctx.clearRect(0,0,this.w,this.h);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#1e2126';ctx.lineWidth=3.4;
  const all=this.act&&!this.erasing?[...this.strokes,this.act]:this.strokes;
  for(const s of all){if(s.length<2)continue;ctx.beginPath();ctx.moveTo(s[0].x,s[0].y);for(let i=1;i<s.length-1;i++){const m={x:(s[i].x+s[i+1].x)/2,y:(s[i].y+s[i+1].y)/2};ctx.quadraticCurveTo(s[i].x,s[i].y,m.x,m.y);}ctx.lineTo(s[s.length-1].x,s[s.length-1].y);ctx.stroke();}}
 clear(){this.strokes=[];this.hist=[[]];this.hi=0;this.draw();}
 /* r8.3 Bersihkan: kosongkan kertas sebagai satu langkah riwayat, jadi Mundur bisa mengembalikannya */
 wipe(){if(!this.strokes.length)return false;this.strokes=[];this.commit('clear');this.draw();return true;}
 groups(){
  const bb=s=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of s){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}return{x0,y0,x1,y1};};
  const items=this.strokes.map(s=>({s,b:bb(s)})),par=items.map((_,i)=>i),f=i=>par[i]===i?i:(par[i]=f(par[i]));
  const near=(a,b)=>{const m=26;return a.x0-m<b.x1&&a.x1+m>b.x0&&a.y0-m<b.y1&&a.y1+m>b.y0;};
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(near(items[i].b,items[j].b))par[f(i)]=f(j);
  const g=new Map();items.forEach((it,i)=>{const r=f(i);if(!g.has(r))g.set(r,[]);g.get(r).push(it.s);});
  return[...g.values()].filter(gr=>{const b=bb(gr.flat());return Math.max(b.x1-b.x0,b.y1-b.y0)>=14;});
 }
}
addEventListener('keydown',e=>{if(e.key==='e'||e.key==='E')Sketch.eKey=true;});
addEventListener('keyup',e=>{if(e.key==='e'||e.key==='E')Sketch.eKey=false;});
addEventListener('blur',()=>{Sketch.eKey=false;});
function bboxOf(strokes){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const s of strokes)for(const p of s){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}return{x0,y0,x1,y1,w:x1-x0,h:y1-y0};}
function strokesSvg(strokes,pad=4){
 const b=bboxOf(strokes),w=Math.max(b.w,1),h=Math.max(b.h,1);
 const d=strokes.map(s=>'M'+s.map(p=>(p.x-b.x0+pad).toFixed(1)+' '+(p.y-b.y0+pad).toFixed(1)).join('L')).join('');
 return `<svg viewBox="0 0 ${(w+pad*2).toFixed(1)} ${(h+pad*2).toFixed(1)}" preserveAspectRatio="xMidYMid meet"><path d="${d}" fill="none" stroke="#1e2126" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---- glyphs (24px grid) ---- */
SU.Sketch=Sketch;SU.bboxOf=bboxOf;SU.strokesSvg=strokesSvg;
})();
