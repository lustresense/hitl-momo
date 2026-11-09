import { useId } from 'react';
import { STICKMAN_DEFINITION } from '../../game/assets/stickman-svg';

/**
 * Bab 4 (Pembuktian) artwork, 490x325 like the other scenes and drawn in scene 3's style.
 * Every collider in getFinalStageGeometry() has a rect here with the same source coordinates
 * (data-collider / data-hazard), so the drawing and the physics agree. StageArtwork's defs are not
 * exported, so the few needed here are repeated.
 */
export function StageArtworkFinal({ gameplay = false }: { gameplay?: boolean }) {
  const id = useId();
  const prefix = `final-${id.replace(/[^a-zA-Z0-9_-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}_`)}`;
  const title = 'Pembuktian';

  return (
    <svg className="art-svg" viewBox="0 0 490 325" preserveAspectRatio="xMidYMid slice" role="img" aria-label={title} data-scene="4">
      <title>{title}</title>
      <defs>
        <filter id={`${prefix}-rough`}>
          <feTurbulence type="fractalNoise" baseFrequency=".075" numOctaves="1" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="0.7" />
        </filter>
        <pattern id={`${prefix}-dirt`} width="46" height="46" patternUnits="userSpaceOnUse">
          <rect width="46" height="46" fill="#a9733f" />
          <path d="M0 12q11-7 23 0t23 0M0 34q11-7 23 0t23 0" stroke="#7e5128" strokeWidth="1.3" fill="none" opacity=".55" />
          <path d="M8 22l5 3M30 4l4 3M36 40l5-2" stroke="#c28f58" strokeWidth="2" opacity=".6" />
          <circle cx="26" cy="10" r="1" fill="#f1ddba" opacity=".45" />
          <circle cx="13" cy="30" r="1.2" fill="#563d29" opacity=".24" />
        </pattern>
        <pattern id={`${prefix}-spk`} width="22" height="46" patternUnits="userSpaceOnUse">
          <path d="M1 46L11 12L21 46Z" fill="#cfcabb" stroke="#1e2126" strokeWidth="1.6" />
        </pattern>
        <g id={`${prefix}-man`} fill={STICKMAN_DEFINITION.fill} stroke={STICKMAN_DEFINITION.stroke} strokeWidth={STICKMAN_DEFINITION.strokeWidth} strokeLinecap={STICKMAN_DEFINITION.strokeLinecap}>
          <circle {...STICKMAN_DEFINITION.circle} />
          <path d={STICKMAN_DEFINITION.path} />
        </g>
        <g id={`${prefix}-flag`}>
          <path d="M0 0V-52" stroke="#1e2126" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M1-52L30-42L1-34Z" fill="#df6930" stroke="#1e2126" strokeWidth="2" strokeLinejoin="round" />
        </g>
        <g id={`${prefix}-spark`} stroke="#df6930" strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M0 0l-5-11M9 3l4-10M15 10l10-4" />
        </g>
      </defs>

      <g fill="#d6d3c8" opacity=".42">
        <path d="M0 325V260h30v-50h34v80h30v-110h40v140h30v-60h36v120h40v-90h30v100h40v-40h40v52h30V325z" />
      </g>

      <g filter={`url(#${prefix}-rough)`} stroke="#1e2126" strokeWidth="2.4" strokeLinejoin="round">
        <rect data-collider="stage-4-left-cliff" x="0" y="198" width="100" height="127" fill={`url(#${prefix}-dirt)`} />
        <rect x="0" y="198" width="100" height="15" fill="#7ea142" />
        <rect data-collider="stage-4-right-tower" x="385" y="50" width="105" height="275" fill={`url(#${prefix}-dirt)`} />
        <rect x="385" y="50" width="105" height="15" fill="#7ea142" />
        <path d="M385 84h105M385 118h105M385 152h105M385 186h105M385 220h105M385 254h105" fill="none" stroke="#7e5128" strokeWidth="1.4" opacity=".45" />
        <rect x="421" y="96" width="30" height="20" fill="#f3ead2" strokeWidth="1.6" />
      </g>

      <g data-hazard="stage-4-spike-pit" filter={`url(#${prefix}-rough)`} stroke="#1e2126" strokeWidth="2.4">
        <rect x="100" y="282" width="285" height="43" fill="#df6930" />
        <rect x="112" y="282" width="262" height="43" fill={`url(#${prefix}-spk)`} />
      </g>

      {!gameplay && <use data-asset-role="character-preview" href={`#${prefix}-man`} transform="translate(40 198) scale(1.1)" />}
      <use data-asset-role="goal-preview" href={`#${prefix}-flag`} transform="translate(445 50) scale(.8)" />
      <use href={`#${prefix}-spark`} transform="translate(360 40) rotate(-20) scale(.8)" />
    </svg>
  );
}
