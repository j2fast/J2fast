// Pure game rules ported from the web build's src/systems/*.ts (which are
// covered by unit tests there): stats, damage, inventory, loot, progression,
// quests and dialogue conditions. They operate on FLBGameData only.

#pragma once

#include "CoreMinimal.h"
#include "LBTypes.h"

class ULBData;

/** Result of a quest event, turned into notifications by the game mode. */
struct FLBQuestUpdate
{
	enum EKind { Started, Progress, Objective, Completed } Kind = Started;
	FString QuestId;
	FString Text;
	int32 LevelsGained = 0;
};

struct LANTERNBOUND_API FLBRules
{
	static constexpr int32 MaxLevel = 20;
	static constexpr int32 MaxUpgrade = 5;
	static constexpr int32 MaxEquipment = 48;

	// --------------------------------------------------------------- Stats
	static FLBStats BaseStats(int32 Level);
	static float RarityMult(int32 Rarity);
	static void ItemStats(const ULBData& D, const FLBItemInstance& Inst, TMap<FString, float>& Out);
	static FLBStats ComputeStats(const ULBData& D, const FLBGameData& G);
	static bool HasSpecial(const ULBData& D, const FLBGameData& G, const FString& Special);
	static float DefenseFactor(float Def);
	static int32 ComputeDamage(float Atk, float Mult, float AtkPct, float Buff, float Crit, float CritDmg, bool bForceCrit, float TargetDef, FRandomStream& Rng, bool& bOutCrit);

	// --------------------------------------------------------------- Inventory
	static FString NewUid(FLBGameData& G);
	static FLBItemInstance* FindItem(FLBGameData& G, const FString& Uid);
	static const FLBItemInstance* FindItemConst(const FLBGameData& G, const FString& Uid);
	static int32 CountItem(const FLBGameData& G, const FString& Id);
	static int32 EquipmentCount(const ULBData& D, const FLBGameData& G);
	/** Adds items; returns the number actually added (overflow is sold automatically). */
	static int32 AddItem(const ULBData& D, FLBGameData& G, const FString& Id, int32 Qty = 1, int32 Rarity = -1, const TArray<FLBStat>* Affixes = nullptr, FString* OutUid = nullptr);
	static bool RemoveItem(FLBGameData& G, const FString& IdOrUid, int32 Qty = 1);
	static bool IsEquipped(const FLBGameData& G, const FString& Uid);
	static bool Equip(const ULBData& D, FLBGameData& G, const FString& Uid, const FString& Slot);
	static const FLBItemInstance* ActiveWeapon(const FLBGameData& G);
	static int32 SellValue(const ULBData& D, const FLBItemInstance& Inst);
	static int32 Sell(const ULBData& D, FLBGameData& G, const FString& Uid);
	static bool UpgradeCost(const ULBData& D, const FLBItemInstance& Inst, int32& Coins, int32& Ore, int32& Essence);
	static bool Upgrade(const ULBData& D, FLBGameData& G, const FString& Uid);

	// --------------------------------------------------------------- Loot
	static int32 RollRarity(FRandomStream& Rng, float Luck = 0.f);
	static TArray<FLBStat> RollAffixes(const FLBItemDef& Def, int32 Rarity, FRandomStream& Rng);
	static FString RollEquipmentId(const ULBData& D, FRandomStream& Rng, int32 Tier);

	// --------------------------------------------------------------- Progression
	static int32 XpToNext(int32 Level);
	static int32 AddXp(FLBGameData& G, int32 Amount);
	/** Returns "" on success, otherwise a reason. */
	static FString TrainSkill(const ULBData& D, FLBGameData& G, const FString& SkillId);

	// --------------------------------------------------------------- Quests
	static FLBQuestState* QuestState(FLBGameData& G, const FString& Id);
	static const FLBQuestState* QuestStateConst(const FLBGameData& G, const FString& Id);
	static bool IsDone(const FLBGameData& G, const FString& Id);
	static bool CanStart(const ULBData& D, const FLBGameData& G, const FString& Id);
	static const FLBObjective* CurrentObjective(const ULBData& D, const FLBGameData& G, const FString& Id);
	static void StartQuest(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Id, TArray<FLBQuestUpdate>& Out);
	static void Notify(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Type, const FString& Target, const FString& OnlyQuest, TArray<FLBQuestUpdate>& Out);
	static void CheckCollect(const ULBData& D, FLBGameData& G, FRandomStream& Rng, TArray<FLBQuestUpdate>& Out);
	static FString ObjectiveText(const ULBData& D, const FLBGameData& G, const FString& Id);

	// --------------------------------------------------------------- Dialogue
	static bool EvalCond(const ULBData& D, const FLBGameData& G, const FLBCond& C);
	static const FLBNpcDialogueEntry* SelectDialogue(const ULBData& D, const FLBGameData& G, const FString& NpcId);

	// --------------------------------------------------------------- New game
	static FLBGameData NewGame(const ULBData& D, FRandomStream& Rng, TArray<FLBQuestUpdate>& Out);
	/** Repairs invalid data from an old or damaged save. Returns warnings. */
	static TArray<FString> Sanitize(const ULBData& D, FLBGameData& G);

private:
	static void Advance(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Id, TArray<FLBQuestUpdate>& Out);
	static void Complete(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Id, TArray<FLBQuestUpdate>& Out);
};
