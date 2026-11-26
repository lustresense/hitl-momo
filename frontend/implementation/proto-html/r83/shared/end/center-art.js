/* hand-made art of Pusat Halaman (the repo draws the ending in CSS only, so this scene has no repo art to copy) */
(function(){
'use strict';
window.SU=window.SU||{};
const DEFS="<svg id=\"sa-defs\" width=\"0\" height=\"0\" style=\"position:absolute\" aria-hidden=\"true\" focusable=\"false\"><defs>\n <filter id=\"sa-rough\"><feTurbulence type=\"fractalNoise\" baseFrequency=\".075\" numOctaves=\"1\" seed=\"4\"/><feDisplacementMap in=\"SourceGraphic\" scale=\"0.7\"/></filter>\n <pattern id=\"sa-dirt\" width=\"46\" height=\"46\" patternUnits=\"userSpaceOnUse\"><rect width=\"46\" height=\"46\" fill=\"#a9733f\"/><path d=\"M0 12q11-7 23 0t23 0M0 34q11-7 23 0t23 0\" stroke=\"#7e5128\" stroke-width=\"1.3\" fill=\"none\" opacity=\".55\"/><path d=\"M8 22l5 3M30 4l4 3M36 40l5-2\" stroke=\"#c28f58\" stroke-width=\"2\" opacity=\".6\"/><path d=\"M6 9l8 -3M22 20l11 -5M3 37l7 -3M37 24l7 -3\" stroke=\"#543e2b\" stroke-width=\".9\" stroke-linecap=\"round\" opacity=\".22\"/><circle cx=\"26\" cy=\"10\" r=\"1\" fill=\"#f1ddba\" opacity=\".45\"/><circle cx=\"13\" cy=\"30\" r=\"1.2\" fill=\"#563d29\" opacity=\".24\"/></pattern>\n <pattern id=\"sa-spk\" width=\"22\" height=\"46\" patternUnits=\"userSpaceOnUse\"><path d=\"M1 46L11 12L21 46Z\" fill=\"#cfcabb\" stroke=\"#1e2126\" stroke-width=\"1.6\"/></pattern>\n <g id=\"sa-cloud\" fill=\"#fcf9ef\" stroke=\"#aaa99f\" stroke-width=\"1.8\" stroke-linecap=\"round\"><path d=\"M0 40q-8-24 22-26q8-22 38-12q24-8 34 14q22 4 14 24z\"/><path d=\"M12 30q18-6 30 0M50 26q16-6 30 2\" fill=\"none\" opacity=\".7\"/><path d=\"M14 38l8 -4M30 40l8 -5M60 36l8 -5M84 37l7 -4\" fill=\"none\" stroke=\"#a8a59e\" stroke-width=\".9\" opacity=\".52\" stroke-linecap=\"round\"/></g>\n <g id=\"sa-city\" fill=\"#d6d3c8\" opacity=\".42\"><path d=\"M0 325V230h26v-40h30v60h22v-90h34v110h26v-60h30v100h30v-70h40v90z\"/></g>\n <g id=\"sa-flag\"><path d=\"M0 0V-52\" stroke=\"#1e2126\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><path d=\"M1-52L30-42L1-34Z\" fill=\"#df6930\" stroke=\"#1e2126\" stroke-width=\"2\" stroke-linejoin=\"round\"/></g>\n</defs></svg>";
const SIGN_={1:['Lanjut ke','Level 2'],2:['Lanjut ke','Level 3'],3:['Menuju','Pusat Halaman']};
function signpost(n,tx,ty,custom){
 const [s,b]=custom||SIGN_[n],arm=n===2?16:0,fl=(t,z)=>t.length*z*.56>54?' textLength="54" lengthAdjust="spacingAndGlyphs"':'';
 return `<g transform="translate(${tx} ${ty})"><path d="M0 0V-54" stroke="#1e2126" stroke-width="3.5" stroke-linecap="round"/><g transform="translate(0 ${arm})"><path d="M-58 -50h58l14 13l-14 13h-58z" fill="#df6930" stroke="#1e2126" stroke-width="1.8" stroke-linejoin="round"/><text text-anchor="middle" font-weight="700" fill="#1e2126"><tspan x="-29" y="-40" font-size="5"${fl(s,5)}>${s}</tspan><tspan x="-29" y="-30.6" font-size="7.4"${fl(b,7.4)}>${b}</tspan></text></g></g>`;
}
const GR='<g filter="url(#sa-rough)" stroke="#1e2126" stroke-width="2.4" stroke-linejoin="round">';
function art4(){
 const n=4;
 let b='';
 if(n===4)b=`<use href="#sa-city" transform="translate(-10 20)"/><g class="cm" data-d="8"><use href="#sa-cloud" transform="translate(20 40)" opacity=".8"/></g><g class="cm" data-d="-10"><use href="#sa-cloud" transform="translate(330 70) scale(.8)" opacity=".7"/></g><g class="cm" data-d="6"><use href="#sa-cloud" transform="translate(190 120) scale(.6)" opacity=".6"/></g>${GR}<path d="M-10 262Q120 236 245 250T500 246V330H-10z" fill="url(#sa-dirt)"/><path d="M-10 262Q120 236 245 250T500 246V256Q380 262 245 260T-10 272z" fill="#7ea142"/></g>${signpost(4,96,252,['Selamat datang di','Pusat Halaman'])}`;
 return `<svg class="art-svg" viewBox="0 0 490 325" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Pusat Halaman">${b}</svg>`;
}
SU.centerArt={defs:DEFS,svg:art4};
})();
