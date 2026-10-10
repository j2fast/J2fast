// Area identifiers (kept separate so pure systems can validate saves without
// importing rendering code).

export const AREA_IDS = ['village', 'bamboo', 'marsh', 'catacombs', 'summit'] as const;
export type AreaId = (typeof AREA_IDS)[number];

export const AREA_NAMES: Record<AreaId, string> = {
  village: 'Akari Village',
  bamboo: 'Sasagiri Bamboo Grove',
  marsh: 'Mistfen Marsh',
  catacombs: 'Hollow Catacombs',
  summit: 'Hinoyama Summit',
};

/** Connections between areas, used to route quest waypoints across areas. */
export const AREA_LINKS: Record<AreaId, AreaId[]> = {
  village: ['bamboo', 'marsh', 'summit'],
  bamboo: ['village'],
  marsh: ['village', 'catacombs'],
  catacombs: ['marsh'],
  summit: ['village'],
};

/** Next area to travel to on the shortest route from `from` to `to`. */
export function nextAreaToward(from: AreaId, to: AreaId): AreaId | null {
  if (from === to) return null;
  const prev = new Map<AreaId, AreaId>();
  const queue: AreaId[] = [from];
  const seen = new Set<AreaId>([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of AREA_LINKS[cur]) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        let step: AreaId = n;
        while (prev.get(step) !== from) step = prev.get(step)!;
        return step;
      }
      queue.push(n);
    }
  }
  return null;
}
