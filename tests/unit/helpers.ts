import { Rng } from '../../src/core/rng';
import { addItem, equip } from '../../src/systems/inventory';
import { QuestLog } from '../../src/systems/quests';
import { GameData, newGameData } from '../../src/systems/state';

/** A fresh game in the same state the real "New Game" produces. */
export function freshGame(): { data: GameData; quests: QuestLog; rng: Rng } {
  const data = newGameData(1000);
  const rng = new Rng(42);
  const k = addItem(data, 'katana_wanderer').instance!;
  equip(data, k.uid, 'weapon1');
  const a = addItem(data, 'armor_traveler').instance!;
  equip(data, a.uid, 'armor');
  const quests = new QuestLog(data, rng);
  quests.start('mq_oath');
  return { data, quests, rng };
}
