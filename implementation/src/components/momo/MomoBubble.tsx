import { momoLine, momoMood, type MomoMoment, type MomoMood } from "@/src/domain/momo-script";
import { MomoAvatar } from "./MomoAvatar";

/**
 * TASK 11 - Momo boundary: animated avatar slot + state-driven text bubble.
 * No chat input, no speech, no LLM, never creates objects or decides (lore).
 * The avatar is the Owner's Momo artwork (momo-engine.ts); its mood follows the moment.
 */
export function MomoBubble({ moment, message, mood, avatarHeight = 62, trackMotion = false, flapKey }: { moment: MomoMoment; message?: string; mood?: MomoMood; avatarHeight?: number; trackMotion?: boolean; flapKey?: number }) {
  return (
    <div className="momo">
      <MomoAvatar className="momo-avatar" expression={mood ?? momoMood(moment)} height={avatarHeight} trackMotion={trackMotion} flapKey={flapKey} />
      <div className="momo-bubble" role="status">
        {message ?? momoLine(moment)}
      </div>
    </div>
  );
}
