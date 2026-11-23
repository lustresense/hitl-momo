import { describe, it, expect } from 'vitest';
import { resolveBehavior } from '../../src/domain/behavior-resolver';
import { LEVELS } from '../../src/domain/levels';
import { lookupModelLabel } from '../../src/prediction/label-map';
const labels = { solid: ['ladder','stairs','bridge','bench','table','skateboard'], danger: ['cactus','campfire','lightning','saw','knife','sword','snake','spider'], neutral: ['fence','zigzag','line','cloud','bucket','umbrella'] } as const;
describe('Dias class behaviors', () => {
 for (const [behavior, classes] of Object.entries(labels)) for (const label of classes) it(`${label}: ${behavior}`, () => {
  const entry=lookupModelLabel(label); expect(entry?.gameLabel).toBeTruthy();
  for (const level of LEVELS) expect(resolveBehavior(entry!.gameLabel!,level).behavior).toBe(behavior);
 });
});
