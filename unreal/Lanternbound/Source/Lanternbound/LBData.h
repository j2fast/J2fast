// Loads Content/Data/*.json once per game instance and exposes lookups.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "LBTypes.h"
#include "LBData.generated.h"

UCLASS()
class LANTERNBOUND_API ULBData : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** Empty when everything loaded; otherwise a human-readable error shown on screen. */
	FString LoadError;

	TMap<FString, FLBWeaponFamily> Weapons;
	TMap<FString, FLBItemDef> Items;
	TMap<FString, FLBEnemyDef> Enemies;
	TMap<FString, FLBQuestDef> Quests;
	TMap<FString, FLBDialogue> Dialogues;
	TMap<FString, TArray<FLBNpcDialogueEntry>> NpcDialogue;
	TMap<FString, FString> NpcNames;
	TMap<FString, FLBBossLines> BossLines;
	TArray<FLBLine> Ending;
	TArray<FLBSkillDef> Skills;
	TArray<FLBShopEntry> Shop;
	TArray<FString> QuestOrder;

	/** Area layouts are loaded on demand and cached. */
	const FLBAreaData* GetArea(const FString& AreaId);

	const FLBItemDef* Item(const FString& Id) const { return Items.Find(Id); }
	const FLBSkillDef* Skill(const FString& Id) const;
	FString NpcName(const FString& Id) const;

	static ULBData* Get(const UObject* WorldContext);
	/** Content/Data directory (staged as loose files, see DefaultGame.ini). */
	static FString DataDir();

private:
	// Shared pointers keep each area's address stable while more areas are cached.
	TMap<FString, TSharedPtr<FLBAreaData>> AreaCache;
	bool LoadFile(const FString& Name, FString& OutText);
};
