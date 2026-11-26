export interface HandCandidate {
  id: number;
  open: boolean;
}

export interface OwnerLock {
  /** Returns current owner id (or null). tGapMs: owner absence tolerated before release. */
  update(tMs: number, hands: ReadonlyArray<HandCandidate>, tGapMs: number): number | null;
  owner(): number | null;
  reset(): void;
}

export function createOwnerLock(): OwnerLock {
  let owner: number | null = null;
  let lastSeen = 0;
  const acquire = (hands: ReadonlyArray<HandCandidate>, t: number): void => {
    const h = hands.find((c) => c.open);
    if (h) {
      owner = h.id;
      lastSeen = t;
    }
  };
  return {
    update(t, hands, tGapMs) {
      if (owner !== null) {
        if (hands.some((h) => h.id === owner)) lastSeen = t;
        else if (t - lastSeen > tGapMs) owner = null;
      }
      if (owner === null) acquire(hands, t);
      return owner;
    },
    owner: () => owner,
    reset() {
      owner = null;
      lastSeen = 0;
    },
  };
}
