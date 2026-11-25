/** Five Owner SVGs from R8.3 shared/icons.js. Original 48-unit grid and 2.6 stroke. */
export type R83Tool="pencil"|"eraser"|"undo"|"redo"|"clear";
export function R83ToolIcon({name,size=30}:{name:R83Tool;size?:number}){
  return <svg width={size} height={size} viewBox="0 0 48 48" strokeWidth="2.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name==="pencil"&&<><path d="M31.5 9.5a3.5 3.5 0 0 1 5 0l2 2a3.5 3.5 0 0 1 0 5L18.2 36.8 9.5 39.5l2.7-8.7L31.5 9.5Z"/><path d="m27.5 13.5 7 7"/><path d="m12.5 31 4.5 4.5"/></>}
    {name==="eraser"&&<><path d="M27.3 11.2a4 4 0 0 1 5.7 0l4.8 4.8a4 4 0 0 1 0 5.7L22.5 37a4 4 0 0 1-5.7 0l-4.8-4.8a4 4 0 0 1 0-5.7l15.3-15.3Z"/><path d="m20 18.5 10.5 10.5"/><path d="M10 38h7.5"/></>}
    {name==="undo"&&<><path d="m17 12-7 7 7 7"/><path d="M10 19h17.5a10 10 0 1 1 0 20H18"/></>}
    {name==="redo"&&<><path d="m31 12 7 7-7 7"/><path d="M38 19H20.5a10 10 0 1 0 0 20H30"/></>}
    {name==="clear"&&<><circle cx="24" cy="24" r="17"/><path d="M25.6 16.4a2.8 2.8 0 0 1 4 0l2 2a2.8 2.8 0 0 1 0 4l-9.2 9.2a2.8 2.8 0 0 1-4 0l-2-2a2.8 2.8 0 0 1 0-4l9.2-9.2Z"/><path d="m21.5 20.5 6 6"/></>}
  </svg>;
}
