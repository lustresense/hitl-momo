import { momoLine, momoMood, type MomoMoment, type MomoMood } from "@/src/domain/momo-script";
import { MomoChat } from "./MomoChat";

/**
 * Momo boundary: animated avatar + state-driven chat bubble (see MomoChat).
 * No chat input, no speech, no LLM, never creates objects or decides (lore).
 * The avatar is the Owner's Momo artwork (momo-engine.ts); its mood follows the moment.
 */
export function MomoBubble({ moment, message, mood, avatarHeight = 96, trackMotion = false, flapKey, typing = false, fog = 0 }: { moment: MomoMoment; message?: string | string[]; mood?: MomoMood; avatarHeight?: number; trackMotion?: boolean; flapKey?: number; typing?: boolean; fog?: number }) {
  return (
    <MomoChat
      lines={message ?? momoLine(moment)}
      mood={mood ?? momoMood(moment)}
      avatarHeight={avatarHeight}
      trackMotion={trackMotion}
      flapKey={flapKey}
      typing={typing}
      fog={fog}
    />
  );
}
