/**
 * Speedometer for the finger direction, shown in the camera bar in place of keyboard hints. A
 * half dial: 0 deg is the student's right, 90 deg is up. The needle follows the live angle and the
 * lit band is the zone the finger is in (walk, jump, jump and walk, stop). Words are plain
 * Indonesian, so the dial reads without the picture.
 */
import {
  steerFromAngle,
  STEER_JUMP_DIAGONAL_MAX_DEG,
  STEER_JUMP_DIAGONAL_MIN_DEG,
  STEER_JUMP_STRAIGHT_MAX_DEG,
  STEER_JUMP_STRAIGHT_MIN_DEG,
  STEER_WALK_DEG,
  type SteerZone,
} from "@/src/input/gameplay-gesture";
import { useSteerAngle } from "./steer-reading";

export const STEER_ZONE_TEXT: Record<SteerZone, string> = {
  "walk-right": "Jalan ke kanan",
  "walk-left": "Jalan ke kiri",
  jump: "Lompat",
  "jump-right": "Lompat sambil ke kanan",
  "jump-left": "Lompat sambil ke kiri",
  stop: "Thinman berhenti",
};
const NOT_READ_TEXT = "Telunjuk belum terbaca";

const CX = 60;
const CY = 56;
const R = 46;
const NEEDLE_R = R - 6;

/** Band edges in degrees, drawn from the same constants as the zone rules. */
const BANDS: Array<{ zone: Exclude<SteerZone, "stop">; from: number; to: number }> = [
  { zone: "walk-right", from: 0, to: STEER_WALK_DEG },
  { zone: "jump-right", from: STEER_JUMP_DIAGONAL_MIN_DEG, to: STEER_JUMP_STRAIGHT_MIN_DEG },
  { zone: "jump", from: STEER_JUMP_STRAIGHT_MIN_DEG, to: STEER_JUMP_STRAIGHT_MAX_DEG },
  { zone: "jump-left", from: STEER_JUMP_STRAIGHT_MAX_DEG, to: STEER_JUMP_DIAGONAL_MAX_DEG },
  { zone: "walk-left", from: 180 - STEER_WALK_DEG, to: 180 },
];

function pointAt(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

/** Arc along the top half from `fromDeg` (larger) to `toDeg` (smaller), clockwise on screen. */
function arcPath(fromDeg: number, toDeg: number): string {
  const a = pointAt(fromDeg, R);
  const b = pointAt(toDeg, R);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * Where the needle is drawn. Angles below horizontal are a finger pointing down: the needle
 * stays at the nearest side of the dial (it means stop, and the words say so).
 */
function needleDeg(angle: number): number {
  const shown = angle < -90 ? angle + 360 : angle;
  return Math.min(195, Math.max(-15, shown));
}

export function SteerDial() {
  const angle = useSteerAngle();
  const zone = angle === null ? null : steerFromAngle(angle);
  const text = zone === null ? NOT_READ_TEXT : STEER_ZONE_TEXT[zone];

  return (
    <div className="steer-dial" data-testid="steer-dial" role="img" aria-label={`Arah telunjuk: ${text}`}>
      <svg className="steer-dial__svg" viewBox="0 0 120 72" width={120} height={72} aria-hidden="true" focusable="false">
        <path className="steer-dial__track" d={arcPath(180, 0)} />
        {BANDS.map((band) => (
          <path
            key={band.zone}
            className={`steer-dial__band steer-dial__band--${band.zone}${zone === band.zone ? " is-active" : ""}`}
            d={arcPath(band.to, band.from)}
          />
        ))}
        {angle !== null && (
          <>
            <line
              className="steer-dial__needle"
              data-testid="steer-needle"
              data-angle={angle}
              x1={CX}
              y1={CY}
              x2={pointAt(needleDeg(angle), NEEDLE_R).x}
              y2={pointAt(needleDeg(angle), NEEDLE_R).y}
            />
            <circle className="steer-dial__hub" cx={CX} cy={CY} r={4} />
          </>
        )}
      </svg>
      <span className="steer-dial__text">{text}</span>
    </div>
  );
}
