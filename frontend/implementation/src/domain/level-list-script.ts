import type {GuideStep} from "./guide-script";
export function levelListCameraStep(unlocked:number):GuideStep {
 const pick="Dekatkan tangan ke pitanya, lalu cubit dan tarik ke bawah.";
 return {mood:"Senang",lines:[unlocked<=1?"Ini daftar levelnya. Mulai dari Level 1.":`Level ${unlocked} sudah kebuka!`,pick]};
}
