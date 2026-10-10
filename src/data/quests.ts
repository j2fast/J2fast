// Quest definitions. Objectives within a quest are completed in order.

export type ObjectiveType = 'talk' | 'kill' | 'reach' | 'interact' | 'boss' | 'event' | 'collect';

export interface ObjectiveDef {
  type: ObjectiveType;
  /** NPC id, enemy id ('any' for any enemy), marker id, interactable kind, boss id, event name or item id. */
  target: string;
  count?: number;
  text: string;
  /** Area where the objective takes place (for the waypoint marker). */
  area?: string;
  /** Marker / NPC / object id the waypoint should point at. */
  waypoint?: string;
  /** For collect objectives: remove the items when the objective completes. */
  consume?: boolean;
  /** Extra hint shown in the tracker (supports {action} prompt tokens). */
  hint?: string;
}

export interface QuestReward {
  xp?: number;
  coins?: number;
  items?: { id: string; qty?: number; rarity?: number }[];
  flags?: string[];
}

export interface QuestDef {
  id: string;
  title: string;
  kind: 'main' | 'side';
  giver: string;
  summary: string;
  prereqs?: string[];
  requiresFlags?: string[];
  objectives: ObjectiveDef[];
  rewards: QuestReward;
  /** Items handed over when the quest starts. */
  startItems?: { id: string; qty?: number }[];
  /** Quests to start automatically when this one completes. */
  next?: string[];
}

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  (
    [
      {
        id: 'mq_oath',
        title: "The Warden's Oath",
        kind: 'main',
        giver: 'tsugumi',
        summary: 'Elder Tsugumi has called the new Lantern Warden. The Spirit Lantern has gone dark.',
        objectives: [
          { type: 'talk', target: 'tsugumi', text: 'Speak with Elder Tsugumi', area: 'village', waypoint: 'tsugumi' },
          { type: 'reach', target: 'training_ground', text: 'Go to the training ground', area: 'village', waypoint: 'training_ground' },
          { type: 'event', target: 'tut_attack', text: 'Strike a training dummy', area: 'village', waypoint: 'training_ground', hint: 'Press {attack} to attack. Press repeatedly to combo.' },
          { type: 'event', target: 'tut_heavy', text: 'Land a heavy attack', area: 'village', waypoint: 'training_ground', hint: 'Press {heavy} for a slower, stronger strike.' },
          { type: 'event', target: 'tut_dodge', text: 'Dodge roll', area: 'village', hint: 'Press {dodge} while moving. You are untouchable mid-roll.' },
          { type: 'event', target: 'tut_lockon', text: 'Lock on to a dummy', area: 'village', waypoint: 'training_ground', hint: 'Press {lockOn} to lock on; {targetNext} switches target.' },
          { type: 'kill', target: 'training_dummy', count: 3, text: 'Destroy training dummies', area: 'village', waypoint: 'training_ground' },
          { type: 'event', target: 'tut_swap', text: 'Swap to your bow and back', area: 'village', hint: 'Press {swapWeapon} to switch between your two weapons.' },
          { type: 'talk', target: 'tsugumi', text: 'Return to Elder Tsugumi', area: 'village', waypoint: 'tsugumi' },
        ],
        startItems: [{ id: 'bow_willow' }],
        rewards: { xp: 60, coins: 60, items: [{ id: 'dango', qty: 3 }] },
        next: ['mq_bamboo'],
      },
      {
        id: 'mq_bamboo',
        title: 'Ash in the Bamboo',
        kind: 'main',
        giver: 'tsugumi',
        summary: 'Ash drifts down from Sasagiri Bamboo Grove. Something with iron in its voice has claimed the old gate.',
        prereqs: ['mq_oath'],
        objectives: [
          { type: 'reach', target: 'area:bamboo', text: 'Travel to Sasagiri Bamboo Grove', area: 'village', waypoint: 'exit_bamboo' },
          { type: 'kill', target: 'ashen_imp', count: 6, text: 'Drive out the Ashen Imps', area: 'bamboo', waypoint: 'imp_camp' },
          { type: 'talk', target: 'kohaku', text: 'Free the caged fox spirit', area: 'bamboo', waypoint: 'kohaku' },
          { type: 'reach', target: 'oni_gate', text: 'Find the broken gate', area: 'bamboo', waypoint: 'oni_gate' },
          { type: 'boss', target: 'kuroganemaru', text: 'Defeat Kuroganemaru, the Iron-Gate Oni', area: 'bamboo', waypoint: 'oni_arena' },
          { type: 'talk', target: 'tsugumi', text: 'Bring the Ember Core to Elder Tsugumi', area: 'village', waypoint: 'tsugumi' },
        ],
        rewards: { xp: 250, coins: 150, flags: ['marsh_open'] },
        next: ['mq_marsh'],
      },
      {
        id: 'mq_marsh',
        title: 'Lights in the Mist',
        kind: 'main',
        giver: 'tsugumi',
        summary: 'The second Core sank beneath Mistfen Marsh, into the catacombs where the old priests were laid to rest.',
        prereqs: ['mq_bamboo'],
        objectives: [
          { type: 'talk', target: 'ibuki', text: 'Find the ferryman Ibuki in Mistfen Marsh', area: 'marsh', waypoint: 'ibuki' },
          { type: 'interact', target: 'brazier', count: 3, text: 'Relight the spirit braziers', area: 'marsh', waypoint: 'brazier', hint: 'Stand by a brazier and press {interact}.' },
          { type: 'reach', target: 'area:catacombs', text: 'Descend into the Hollow Catacombs', area: 'marsh', waypoint: 'exit_catacombs' },
          { type: 'boss', target: 'itomaru', text: 'Defeat Itomaru, the Silk Widow', area: 'catacombs', waypoint: 'widow_arena' },
          { type: 'talk', target: 'tsugumi', text: 'Return to Elder Tsugumi', area: 'village', waypoint: 'tsugumi' },
        ],
        rewards: { xp: 500, coins: 300, flags: ['summit_open'] },
        next: ['mq_summit'],
      },
      {
        id: 'mq_summit',
        title: 'The Broken Lantern',
        kind: 'main',
        giver: 'tsugumi',
        summary: 'Two Cores are home. The last is held by Yomikage itself, at the summit where the Lantern once burned.',
        prereqs: ['mq_marsh'],
        objectives: [
          { type: 'talk', target: 'mikoto', text: "Receive Mikoto's blessing at the shrine", area: 'village', waypoint: 'mikoto' },
          { type: 'reach', target: 'summit_top', text: 'Climb to the summit of Hinoyama', area: 'summit', waypoint: 'summit_top' },
          { type: 'boss', target: 'yomikage', text: 'Defeat Yomikage, the Hollow Mask', area: 'summit', waypoint: 'summit_top' },
          { type: 'interact', target: 'lantern', text: 'Relight the Spirit Lantern', area: 'summit', waypoint: 'lantern' },
        ],
        rewards: { xp: 0, coins: 0 },
      },

      // ------------------------------------------------------------ Side quests
      {
        id: 'sq_ore',
        title: 'Ore for the Forge',
        kind: 'side',
        giver: 'kanetsugu',
        summary: 'Kanetsugu cannot work without Spirit Ore. The Hollowed seem to carry it.',
        prereqs: ['mq_oath'],
        objectives: [
          { type: 'collect', target: 'spirit_ore', count: 5, text: 'Gather Spirit Ore', hint: 'Defeated Hollowed often drop ore. Kanetsugu takes them when you return.' },
          { type: 'talk', target: 'kanetsugu', text: 'Bring the ore to Kanetsugu', area: 'village', waypoint: 'kanetsugu' },
        ],
        rewards: { xp: 80, coins: 60, items: [{ id: 'naginata_shrine', rarity: 1 }] },
      },
      {
        id: 'sq_firefly',
        title: 'The Lost Firefly',
        kind: 'side',
        giver: 'mikoto',
        summary: 'A child spirit named Hotaru wandered into the bamboo and never crossed over.',
        prereqs: ['mq_oath'],
        objectives: [
          { type: 'talk', target: 'hotaru', text: 'Find Hotaru in the bamboo grove', area: 'bamboo', waypoint: 'hotaru' },
          { type: 'talk', target: 'mikoto', text: "Bring Hotaru's bell to Mikoto", area: 'village', waypoint: 'mikoto' },
        ],
        rewards: { xp: 120, coins: 40, items: [{ id: 'charm_fox', rarity: 1 }] },
      },
      {
        id: 'sq_wisps',
        title: 'Wisp Bounty',
        kind: 'side',
        giver: 'ohana',
        summary: 'Ember wisps keep scorching the tea fields. Ohana is offering a bounty.',
        prereqs: ['mq_oath'],
        objectives: [
          { type: 'kill', target: 'ember_wisp', count: 5, text: 'Snuff out Ember Wisps' },
          { type: 'talk', target: 'ohana', text: 'Collect the bounty from Ohana', area: 'village', waypoint: 'ohana' },
        ],
        rewards: { xp: 150, coins: 120, items: [{ id: 'spirit_tea', qty: 2 }, { id: 'ember_incense', qty: 2 }] },
      },
      {
        id: 'sq_parcel',
        title: 'A Parcel for the Ferryman',
        kind: 'side',
        giver: 'ohana',
        summary: 'Ohana wants her finest tea delivered to Ibuki, who has kept the marsh ferry for longer than anyone remembers.',
        prereqs: ['mq_bamboo'],
        requiresFlags: ['marsh_open'],
        startItems: [{ id: 'tea_parcel' }],
        objectives: [{ type: 'talk', target: 'ibuki', text: 'Deliver the tea parcel to Ibuki', area: 'marsh', waypoint: 'ibuki' }],
        rewards: { xp: 180, coins: 80, items: [{ id: 'charm_crane', rarity: 2 }] },
      },
      {
        id: 'sq_sentinels',
        title: 'Stone Silence',
        kind: 'side',
        giver: 'mikoto',
        summary: 'The marsh sentinels were once shrine guardians. Their corrupted stone must be laid to rest.',
        prereqs: ['mq_bamboo'],
        requiresFlags: ['marsh_open'],
        objectives: [
          { type: 'kill', target: 'stone_sentinel', count: 3, text: 'Lay Stone Sentinels to rest' },
          { type: 'talk', target: 'mikoto', text: 'Report to Mikoto', area: 'village', waypoint: 'mikoto' },
        ],
        rewards: { xp: 320, coins: 150, items: [{ id: 'hollow_essence', qty: 3 }, { id: 'tanto_nightwhisper', rarity: 2 }] },
      },
    ] as QuestDef[]
  ).map((q) => [q.id, q]),
);

export const MAIN_QUEST_ORDER = ['mq_oath', 'mq_bamboo', 'mq_marsh', 'mq_summit'];
