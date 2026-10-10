// Inline SVG icons for items (drawn for this project).

import { ITEMS } from '../data/items';

const S = (inner: string, color = 'currentColor') =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICONS: Record<string, string> = {
  katana: S('<path d="M12 52 L50 10" stroke-width="4"/><path d="M14 44 L20 50"/><path d="M8 56 L14 50" stroke-width="6"/>', '#dfe6ee'),
  naginata: S('<path d="M10 56 L44 18" stroke="#a07050" stroke-width="4"/><path d="M44 18 Q50 8 56 6 Q54 14 48 22 Z" fill="#dfe6ee" stroke="#dfe6ee"/>'),
  tanto: S('<path d="M10 40 L30 20" stroke="#dfe6ee"/><path d="M8 42 L14 48" stroke-width="5"/><path d="M34 44 L54 24" stroke="#dfe6ee"/><path d="M32 46 L38 52" stroke-width="5"/>'),
  kanabo: S('<path d="M12 54 L22 44" stroke="#a07050" stroke-width="4"/><path d="M22 44 L48 12" stroke="#7a5a42" stroke-width="10"/><circle cx="34" cy="30" r="2" fill="#ccc"/><circle cx="42" cy="20" r="2" fill="#ccc"/><circle cx="28" cy="38" r="2" fill="#ccc"/>'),
  bow: S('<path d="M18 8 Q50 32 18 56" stroke="#c08060" stroke-width="4"/><path d="M18 8 L18 56" stroke="#f0ead8" stroke-width="1.5"/><path d="M14 32 L56 32" stroke="#f0ead8"/><path d="M50 27 L56 32 L50 37"/>'),
  armor: S('<path d="M20 10 L32 16 L44 10 L54 20 L48 28 L46 54 L18 54 L16 28 L10 20 Z" fill="rgba(216,69,47,0.25)"/><path d="M32 16 L32 54"/>', '#e8a090'),
  charm: S('<path d="M32 6 L32 14"/><rect x="20" y="14" width="24" height="38" rx="4" fill="rgba(255,210,122,0.2)"/><path d="M26 26 L38 26 M26 34 L38 34 M26 42 L34 42"/>', '#ffd27a'),
  dango: S('<path d="M32 4 L32 60" stroke="#a07050"/><circle cx="32" cy="16" r="8" fill="#f4a8c0" stroke="#f4a8c0"/><circle cx="32" cy="32" r="8" fill="#f2ead8" stroke="#f2ead8"/><circle cx="32" cy="48" r="8" fill="#8ad08a" stroke="#8ad08a"/>'),
  tea: S('<path d="M14 24 L50 24 L46 50 Q32 56 18 50 Z" fill="rgba(138,208,138,0.35)"/><path d="M50 30 Q60 32 52 42"/><path d="M26 18 Q24 10 30 6 M36 18 Q34 10 40 6"/>', '#a8e0a8'),
  incense: S('<path d="M22 56 L42 56 L38 46 L26 46 Z" fill="rgba(255,150,80,0.3)"/><path d="M32 46 L32 18"/><path d="M32 18 Q26 12 32 8 Q38 4 34 0"/>', '#ffb070'),
  ore: S('<path d="M14 44 L22 20 L40 14 L52 30 L44 50 L24 54 Z" fill="rgba(106,184,255,0.25)"/><path d="M22 20 L32 34 L40 14 M32 34 L44 50 M32 34 L14 44"/>', '#8ad8ff'),
  essence: S('<path d="M32 8 Q48 30 32 56 Q16 30 32 8 Z" fill="rgba(176,106,255,0.3)"/><circle cx="32" cy="34" r="6"/>', '#c09aff'),
  core: S('<path d="M32 6 L54 32 L32 58 L10 32 Z" fill="rgba(255,160,60,0.4)"/><path d="M32 6 L32 58 M10 32 L54 32"/>', '#ffb050'),
  bell: S('<path d="M20 44 Q20 16 32 14 Q44 16 44 44 Z" fill="rgba(255,210,122,0.25)"/><path d="M16 44 L48 44"/><circle cx="32" cy="50" r="4"/><path d="M32 8 L32 14"/>', '#ffd27a'),
  token: S('<rect x="14" y="10" width="36" height="44" rx="3" fill="rgba(160,112,80,0.3)"/><circle cx="32" cy="28" r="7"/><path d="M24 44 L40 44"/>', '#d8b090'),
  parcel: S('<rect x="12" y="20" width="40" height="30" fill="rgba(160,200,120,0.25)"/><path d="M12 30 L52 30 M32 20 L32 50"/><path d="M26 20 Q32 10 38 20"/>', '#c0e0a0'),
};

export function itemIcon(id: string): string {
  const def = ITEMS[id];
  if (!def) return ICONS.charm;
  if (def.kind === 'weapon') return ICONS[def.weaponType!];
  if (def.kind === 'armor') return ICONS.armor;
  if (def.kind === 'charm') return ICONS.charm;
  const map: Record<string, string> = {
    dango: 'dango',
    spirit_tea: 'tea',
    ember_incense: 'incense',
    spirit_ore: 'ore',
    hollow_essence: 'essence',
    ember_core_1: 'core',
    ember_core_2: 'core',
    ember_core_3: 'core',
    hotaru_bell: 'bell',
    ferry_token: 'token',
    tea_parcel: 'parcel',
  };
  return ICONS[map[id] ?? 'charm'];
}
