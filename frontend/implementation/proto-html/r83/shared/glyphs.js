/* 24px line glyphs shared by every part */
(function(){
'use strict';
window.SU=window.SU||{};
const SV=(p,w=2.2)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const GL={
 pinch:SV('<path d="M9 5c2-2 5-1 5 2v4"/><path d="M5 10c0 4 3 9 8 9s6-3 6-6v-2"/><circle cx="8" cy="8" r="1.4" fill="#ef7a37" stroke="none"/>'),
 palm:SV('<path d="M7 12V6M10.5 11V4M14 11V4.5M17.5 12V7M6 14c0 4 3 7 7 7s6-3 6-6v-3c0-2-3-2-3 0"/>'),
 one:SV('<path d="M11 12V4"/><path d="M7 13c0 5 2 8 6 8s6-3 6-6v-2c0-2-3-2-3 0M7 13c0-2 4-2 4 0"/>'),
 two:SV('<path d="M9 12V4M14 12V4.5"/><path d="M6 14c0 4 3 7 7 7s6-3 6-6v-3c0-2-3-2-3 0M6 14c0-2 3-2 3 0"/>'),
 check:SV('<path d="m5 12.5 4.5 4.5L19 7.5"/>',3.4),
 close:SV('<path d="M6 6l12 12M18 6L6 18"/>',3.4),
 lock:SV('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',2.6),
 down:SV('<path d="M12 5v14M6 13l6 6 6-6"/>',3),
 left:SV('<path d="M19 12H5M11 6l-6 6 6 6"/>',3),
 right:SV('<path d="M5 12h14M13 6l6 6-6 6"/>',3),
 bulb:SV('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
 thumb:SV('<path d="M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3"/>'),
};
SU.GL=GL;SU.SV=SV;
})();
