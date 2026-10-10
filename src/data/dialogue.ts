// Branching dialogue. Each NPC has an ordered list of entries; the first
// entry whose condition passes is played.
//
// Actions:
//   startQuest:<id>     start a quest
//   give:<item>[:qty]   give the player an item
//   take:<item>[:qty]   take items from the player
//   flag:<name>         set a story flag
//   open:shop|smith|shrine  open a service menu after the dialogue
//   rest                restore health/spirit, refill, respawn enemies, autosave
//   heal                restore health

export interface DialogueChoice {
  text: string;
  next?: string | null;
  actions?: string[];
  cond?: Cond;
}

export interface DialogueNode {
  speaker: string;
  text: string;
  next?: string | null;
  choices?: DialogueChoice[];
  actions?: string[];
}

export interface Dialogue {
  id: string;
  start: string;
  nodes: Record<string, DialogueNode>;
}

export interface Cond {
  /** Quest active, optionally at a specific objective index: "quest" or "quest:2". */
  active?: string;
  /** Quest active at or beyond the stage: "quest:2". */
  activeFrom?: string;
  done?: string;
  notDone?: string;
  /** Quest can be started now (prereqs met, not active, not done). */
  available?: string;
  flag?: string;
  notFlag?: string;
  /** Player has at least qty of item: "item:qty". */
  has?: string;
}

export interface NpcDialogueEntry {
  cond?: Cond;
  dialogue: string;
  /** Quest whose "talk" objective this conversation satisfies. */
  quest?: string;
  /** Do not emit a talk event at all. */
  noTalk?: boolean;
}

export const NPC_NAMES: Record<string, string> = {
  tsugumi: 'Elder Tsugumi',
  kanetsugu: 'Kanetsugu',
  ohana: 'Ohana',
  mikoto: 'Mikoto',
  ibuki: 'Ibuki',
  hotaru: 'Hotaru',
  kohaku: 'Kohaku',
  warden: 'Warden',
  farmer: 'Farmer Tomoe',
  child: 'Little Ren',
  fisher: 'Old Sanpei',
};

const d = (id: string, nodes: Record<string, DialogueNode>, start = 'a'): Dialogue => ({ id, start, nodes });

export const DIALOGUES: Record<string, Dialogue> = Object.fromEntries(
  [
    // ------------------------------------------------------------ Tsugumi
    d('tsugumi_intro', {
      a: { speaker: 'tsugumi', text: 'Ah. You came. Good — I was beginning to think the mountain had swallowed you too.', next: 'b' },
      b: { speaker: 'tsugumi', text: 'Look up, Warden. The Spirit Lantern on Hinoyama has gone dark. Three nights now.', next: 'c' },
      c: {
        speaker: 'tsugumi',
        text: 'Without its light the departed cannot find the far shore. They wander. They sour. We call them the Hollowed.',
        choices: [
          { text: 'Who would put out the Lantern?', next: 'd' },
          { text: 'Tell me what to do.', next: 'e' },
        ],
      },
      d: {
        speaker: 'tsugumi',
        text: "Not 'who' — 'what'. A mask with nothing behind it. The old songs call it Yomikage. It shattered the Lantern into three Ember Cores and scattered them across the valley.",
        next: 'e',
      },
      e: {
        speaker: 'tsugumi',
        text: "First, show these old eyes you remember your training. The dummies by the east wall won't hit back... much. Take this bow as well — a Warden should carry two weapons.",
      },
    }),
    d('tsugumi_oath_wait', {
      a: { speaker: 'tsugumi', text: 'The training ground is past the well, by the east wall. Show me your form, Warden.' },
    }),
    d('tsugumi_oath_done', {
      a: { speaker: 'tsugumi', text: "Hm! Sloppy footwork, but your blade knows where it's going. That will do.", next: 'b' },
      b: {
        speaker: 'tsugumi',
        text: 'Ash has been falling on Sasagiri Bamboo Grove, through the north gate. Where there is ash there is fire, and where there is fire this season... there is a Core.',
        next: 'c',
      },
      c: {
        speaker: 'tsugumi',
        text: 'Take these dango. And visit Kanetsugu at the forge and Ohana at the tea house before you go. A Warden who travels alone travels badly.',
      },
    }),
    d('tsugumi_bamboo_wait', {
      a: { speaker: 'tsugumi', text: 'The bamboo grove lies through the north gate. Be careful — the imps hunt in packs, and something larger commands them.' },
    }),
    d('tsugumi_bamboo_done', {
      a: { speaker: 'tsugumi', text: "The Ember Core of Ash... I can feel its warmth from here. You've done well, Warden.", next: 'b' },
      b: { speaker: 'tsugumi', text: 'And a fox spirit at your heels? Kohaku, you old rascal. Keep the Warden alive.', next: 'c' },
      c: { speaker: 'kohaku', text: 'Hmph. The Warden keeps ME alive. Mostly.', next: 'd' },
      d: {
        speaker: 'tsugumi',
        text: 'The second Core sank beneath Mistfen Marsh. Ibuki the ferryman will know where. The east gate is open to you now.',
      },
    }),
    d('tsugumi_marsh_wait', {
      a: { speaker: 'tsugumi', text: 'Mistfen lies beyond the east gate. Ibuki keeps the ferry there — find him before the mist finds you.' },
    }),
    d('tsugumi_marsh_done', {
      a: { speaker: 'tsugumi', text: "Two Cores. Listen — the Lantern's frame already hums with them.", next: 'b' },
      b: { speaker: 'tsugumi', text: 'Only the last remains, and Yomikage holds it close. At the summit, where the Lantern once burned.', next: 'c' },
      c: { speaker: 'tsugumi', text: "Visit Mikoto at the shrine before you climb. The summit path opens only to those she has blessed." },
    }),
    d('tsugumi_summit_wait', {
      a: { speaker: 'tsugumi', text: "The summit path begins behind the shrine. Go with Mikoto's blessing, and come back to us." },
    }),
    d('tsugumi_after', {
      a: { speaker: 'tsugumi', text: 'The Lantern burns again, and every soul in the valley can find its way. Rest a while, Warden. You have earned it.' },
    }),

    // ------------------------------------------------------------ Kanetsugu
    d('kanetsugu_menu', {
      a: {
        speaker: 'kanetsugu',
        text: "Steel doesn't sharpen itself. What do you need?",
        choices: [
          { text: 'Upgrade my gear.', actions: ['open:smith'], next: null },
          { text: 'Need any help?', next: 'work', cond: { available: 'sq_ore' } },
          { text: 'Farewell.', next: null },
        ],
      },
      work: {
        speaker: 'kanetsugu',
        text: "Ore. Spirit Ore. The Hollowed hoard it like magpies. Bring me five pieces and I'll make it worth your while.",
        choices: [
          { text: "I'll find some.", actions: ['startQuest:sq_ore'], next: null },
          { text: 'Not right now.', next: null },
        ],
      },
    }),
    d('kanetsugu_ore_wait', {
      a: {
        speaker: 'kanetsugu',
        text: 'Five Spirit Ore. The Hollowed drop it when they fall. Want me to look at your gear while you\'re here?',
        choices: [
          { text: 'Upgrade my gear.', actions: ['open:smith'], next: null },
          { text: 'Later.', next: null },
        ],
      },
    }),
    d('kanetsugu_ore_done', {
      a: {
        speaker: 'kanetsugu',
        text: "Five pieces, and good ones! Here — a naginata I've been tinkering with. Long reach, for a Warden who likes a little distance.",
        actions: ['take:spirit_ore:5'],
      },
    }),

    // ------------------------------------------------------------ Ohana
    d('ohana_menu', {
      a: {
        speaker: 'ohana',
        text: 'Welcome to the Fallen Leaf! Something warm for the road, Warden?',
        choices: [
          { text: 'Show me your wares.', actions: ['open:shop'], next: null },
          { text: 'Any work?', next: 'wisps', cond: { available: 'sq_wisps' } },
          { text: 'Any work?', next: 'parcel', cond: { available: 'sq_parcel' } },
          { text: 'Farewell.', next: null },
        ],
      },
      wisps: {
        speaker: 'ohana',
        text: "Ember wisps keep drifting into my tea terraces and scorching the leaves! Snuff out five of the little menaces and I'll pay you handsomely.",
        choices: [
          { text: 'Consider it done.', actions: ['startQuest:sq_wisps'], next: null },
          { text: 'Maybe later.', next: null },
        ],
      },
      parcel: {
        speaker: 'ohana',
        text: "Heading to the marsh? Would you take this to Ibuki? He's kept that ferry since my grandmother's time. Never says thank you, but he drinks every last leaf.",
        choices: [
          { text: "I'll deliver it.", actions: ['startQuest:sq_parcel'], next: null },
          { text: 'Not now.', next: null },
        ],
      },
    }),
    d('ohana_wisps_done', {
      a: { speaker: 'ohana', text: "The terraces are safe! Here's your bounty — and a little something to keep your spirit up.", next: 'b' },
      b: { speaker: 'ohana', text: 'Come back any time. First cup is always on the house for Wardens. Second cup is double.' },
    }),

    // ------------------------------------------------------------ Mikoto
    d('mikoto_menu', {
      a: {
        speaker: 'mikoto',
        text: 'The shrine is quiet today. Would you like to train, or rest a while?',
        choices: [
          { text: 'Train my skills.', actions: ['open:shrine'], next: null },
          { text: 'Rest. (Restore health and save)', actions: ['rest'], next: 'rested' },
          { text: 'Is anything troubling you?', next: 'firefly', cond: { available: 'sq_firefly' } },
          { text: 'Is anything troubling you?', next: 'sentinels', cond: { available: 'sq_sentinels' } },
          { text: 'Farewell.', next: null },
        ],
      },
      rested: { speaker: 'mikoto', text: 'Your wounds are mended, and the shrine will remember this moment. The Hollowed you laid to rest have... stirred again, I am afraid.' },
      firefly: {
        speaker: 'mikoto',
        text: 'A child spirit, Hotaru, never came to the shrine to cross over. Her bell was last heard among the bamboo. Would you find her?',
        choices: [
          { text: "I'll find her.", actions: ['startQuest:sq_firefly'], next: null },
          { text: 'Not yet.', next: null },
        ],
      },
      sentinels: {
        speaker: 'mikoto',
        text: 'The stone sentinels in the marsh once guarded this very shrine. Now they guard nothing but rage. Will you lay three of them to rest?',
        choices: [
          { text: 'I will.', actions: ['startQuest:sq_sentinels'], next: null },
          { text: 'Another time.', next: null },
        ],
      },
    }),
    d('mikoto_firefly_done', {
      a: { speaker: 'mikoto', text: "Her bell... and it's ringing so softly. Then she's on her way home.", next: 'b' },
      b: { speaker: 'mikoto', text: 'Thank you, Warden. Please, take this fox charm. She would want you to have something quick and clever.', actions: ['take:hotaru_bell'] },
    }),
    d('mikoto_sentinels_done', {
      a: { speaker: 'mikoto', text: 'I felt them go quiet, one by one. They can rest now. Take these — the essence of the old guardians should strengthen your gear.' },
    }),
    d('mikoto_blessing', {
      a: { speaker: 'mikoto', text: "So it's time. Kneel, Warden.", next: 'b' },
      b: { speaker: 'mikoto', text: 'By ember and by lantern-light, may the path keep you, and may the dark forget your name.', actions: ['heal', 'flag:blessing'], next: 'c' },
      c: { speaker: 'mikoto', text: 'The summit path behind the shrine is open. Whatever waits for you up there... come back down.' },
    }),

    // ------------------------------------------------------------ Ibuki
    d('ibuki_marsh', {
      a: { speaker: 'ibuki', text: "Hm? A Warden. Haven't seen one this deep in the mist in forty years.", next: 'b' },
      b: { speaker: 'ibuki', text: 'The catacomb doors are sealed by the three braziers of the old priests. Light them and the doors will remember how to open.', next: 'c' },
      c: { speaker: 'ibuki', text: 'The braziers stand on the rises to the north, east and south of here. Mind the lurkers. They bite.' },
    }),
    d('ibuki_parcel', {
      a: { speaker: 'ibuki', text: "Is that... Ohana's tea? Hmph. Tell her the leaves are adequate.", actions: ['take:tea_parcel'], next: 'b' },
      b: { speaker: 'ibuki', text: '...Tell her thank you. And take this. A crane charm. It never tires. Like me.' },
    }),
    d('ibuki_idle', {
      a: { speaker: 'ibuki', text: "The mist is thick today. It's always thick." },
    }),

    // ------------------------------------------------------------ Hotaru
    d('hotaru_found', {
      a: { speaker: 'hotaru', text: 'You can see me? Nobody can see me anymore...', next: 'b' },
      b: {
        speaker: 'hotaru',
        text: 'I followed the fireflies and got lost, and then the imps came, and I hid and hid and hid.',
        choices: [{ text: 'Mikoto is waiting for you at the shrine.', next: 'c' }],
      },
      c: {
        speaker: 'hotaru',
        text: 'The shrine lady? She gives me sweets. Can you bring her my bell? Then she\'ll know I\'m going home.',
        actions: ['give:hotaru_bell', 'flag:hotaru_saved'],
      },
    }),
    d('hotaru_idle', {
      a: { speaker: 'hotaru', text: 'Have you seen the fireflies? They went that way... or that way...' },
    }),

    // ------------------------------------------------------------ Kohaku
    d('kohaku_caged', {
      a: { speaker: 'kohaku', text: 'Psst! Warden! Get rid of those imps and get me out of this cage!' },
    }),
    d('kohaku_freed', {
      a: { speaker: 'kohaku', text: 'Finally! Do you know how long I have been in that cage? Three days. THREE.', next: 'b' },
      b: { speaker: 'kohaku', text: 'Those imps thought a fox spirit would make a fine lantern. Rude.', next: 'c' },
      c: {
        speaker: 'kohaku',
        text: "You're the new Warden? Then you're going after the Iron-Gate Oni. I'm coming with you. Don't argue — I bite harder than I look.",
        actions: ['flag:kohaku_joined'],
      },
    }),
    // ------------------------------------------------------------ Villagers
    d('farmer_before', { a: { speaker: 'farmer', text: 'Ash on the wind again. My rice will taste of smoke this year — if the Hollowed leave any of it.' } }),
    d('farmer_after', { a: { speaker: 'farmer', text: 'Smell that? Clean air. I may even plant the east terrace again. Thank you, Warden.' } }),
    d('child_before', {
      a: {
        speaker: 'child',
        text: 'Are you really a Warden? Can I hold your sword?',
        choices: [
          { text: 'Not today.', next: 'b' },
          { text: 'When you are older.', next: 'b' },
        ],
      },
      b: { speaker: 'child', text: "Fine. But when I'm a Warden I'm getting a BIGGER lantern." },
    }),
    d('child_after', { a: { speaker: 'child', text: "I saw it! The whole mountain lit up! I'm going to be a Warden. Definitely. Probably." } }),
    d('fisher_before', { a: { speaker: 'fisher', text: "Three nights without the Lantern. The fish won't bite, and the dead won't rest. Bad omens, both." } }),
    d('fisher_after', { a: { speaker: 'fisher', text: 'The fish are biting again. And last night I dreamed of my wife, smiling, on the far shore. Good omens, both.' } }),

    d('kohaku_idle', {
      a: { speaker: 'kohaku', text: "What? I'm resting my eyes. I can still smell the Hollowed coming." },
    }),
  ].map((x) => [x.id, x]),
);

export const NPC_DIALOGUE: Record<string, NpcDialogueEntry[]> = {
  tsugumi: [
    { cond: { active: 'mq_oath:0' }, dialogue: 'tsugumi_intro', quest: 'mq_oath' },
    { cond: { active: 'mq_oath:8' }, dialogue: 'tsugumi_oath_done', quest: 'mq_oath' },
    { cond: { active: 'mq_oath' }, dialogue: 'tsugumi_oath_wait', noTalk: true },
    { cond: { active: 'mq_bamboo:5' }, dialogue: 'tsugumi_bamboo_done', quest: 'mq_bamboo' },
    { cond: { active: 'mq_bamboo' }, dialogue: 'tsugumi_bamboo_wait', noTalk: true },
    { cond: { active: 'mq_marsh:4' }, dialogue: 'tsugumi_marsh_done', quest: 'mq_marsh' },
    { cond: { active: 'mq_marsh' }, dialogue: 'tsugumi_marsh_wait', noTalk: true },
    { cond: { active: 'mq_summit' }, dialogue: 'tsugumi_summit_wait', noTalk: true },
    { dialogue: 'tsugumi_after', noTalk: true },
  ],
  kanetsugu: [
    { cond: { active: 'sq_ore:1', has: 'spirit_ore:5' }, dialogue: 'kanetsugu_ore_done', quest: 'sq_ore' },
    { cond: { active: 'sq_ore' }, dialogue: 'kanetsugu_ore_wait', noTalk: true },
    { dialogue: 'kanetsugu_menu', noTalk: true },
  ],
  ohana: [
    { cond: { active: 'sq_wisps:1' }, dialogue: 'ohana_wisps_done', quest: 'sq_wisps' },
    { dialogue: 'ohana_menu', noTalk: true },
  ],
  mikoto: [
    { cond: { active: 'sq_firefly:1', has: 'hotaru_bell:1' }, dialogue: 'mikoto_firefly_done', quest: 'sq_firefly' },
    { cond: { active: 'sq_sentinels:1' }, dialogue: 'mikoto_sentinels_done', quest: 'sq_sentinels' },
    { cond: { active: 'mq_summit:0' }, dialogue: 'mikoto_blessing', quest: 'mq_summit' },
    { dialogue: 'mikoto_menu', noTalk: true },
  ],
  ibuki: [
    { cond: { active: 'mq_marsh:0' }, dialogue: 'ibuki_marsh', quest: 'mq_marsh' },
    { cond: { active: 'sq_parcel:0' }, dialogue: 'ibuki_parcel', quest: 'sq_parcel' },
    { dialogue: 'ibuki_idle', noTalk: true },
  ],
  hotaru: [
    { cond: { active: 'sq_firefly:0' }, dialogue: 'hotaru_found', quest: 'sq_firefly' },
    { dialogue: 'hotaru_idle', noTalk: true },
  ],
  farmer: [{ cond: { flag: 'lantern_lit' }, dialogue: 'farmer_after', noTalk: true }, { dialogue: 'farmer_before', noTalk: true }],
  child: [{ cond: { flag: 'lantern_lit' }, dialogue: 'child_after', noTalk: true }, { dialogue: 'child_before', noTalk: true }],
  fisher: [{ cond: { flag: 'lantern_lit' }, dialogue: 'fisher_after', noTalk: true }, { dialogue: 'fisher_before', noTalk: true }],
  kohaku: [
    { cond: { active: 'mq_bamboo:2' }, dialogue: 'kohaku_freed', quest: 'mq_bamboo' },
    { cond: { notFlag: 'kohaku_joined' }, dialogue: 'kohaku_caged', noTalk: true },
    { dialogue: 'kohaku_idle', noTalk: true },
  ],
};

/** Lines spoken by bosses (shown as subtitles). */
export const BOSS_LINES: Record<string, { intro: string[]; phase: string[]; defeat: string }> = {
  kuroganemaru: {
    intro: ['WHO KNOCKS ON MY GATE?', 'A hundred years I have guarded it. I will guard it a hundred more — with your bones for the bolt!'],
    phase: ['You sting like a hornet, little Warden. Then I will stop holding back!'],
    defeat: 'The gate... opens... at last...',
  },
  itomaru: {
    intro: ['A little moth, fluttering into my web.', 'Come closer, Warden. I have so many threads to spare.'],
    phase: ['You tear my silk? Then I will weave you into the dark!'],
    defeat: 'My threads... unravel...',
  },
  yomikage: {
    intro: ['Light is a lie told to the dead.', 'I hold them here, where nothing ever ends. Put down your little flame, Warden.'],
    phase: ['You would burn it all again? Every goodbye, every ending?', 'THEN BURN WITH IT!'],
    defeat: '...so bright... I had forgotten how bright...',
  },
};

export const ENDING_LINES: { speaker: string; text: string }[] = [
  { speaker: '', text: 'The three Ember Cores rise from your hands and settle into the Lantern\'s frame.' },
  { speaker: '', text: 'The Spirit Lantern flares to life, and its light spills down Hinoyama like water.' },
  { speaker: '', text: 'In the bamboo, in the marsh, in the deep catacombs, the Hollowed pause... and remember who they were.' },
  { speaker: '', text: 'One by one, they turn toward the light, and cross to the far shore.' },
  { speaker: 'kohaku', text: 'Not bad, Warden. Not bad at all.' },
  { speaker: 'tsugumi', text: 'Welcome home.' },
];
