import { StageArtwork } from './StageArtwork';
import type { SceneIndex } from './scene-metadata';
import styles from './stage-world.module.css';

interface StageWorldProps {
  scene: SceneIndex;
  className?: string;
}

/** Pure visual stage surface; scene selection belongs to its parent. */
export function StageWorld({ scene, className }: StageWorldProps) {
  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      data-testid="stage-world"
      data-scene={scene}
    >
      <StageArtwork scene={scene} />
    </div>
  );
}
