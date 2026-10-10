// Data structures mirroring Content/Data/*.json (exported from the web build
// by scripts/export-unreal.mjs). Field names match the JSON keys so
// FJsonObjectConverter can fill them directly.

#pragma once

#include "CoreMinimal.h"
#include "LBTypes.generated.h"

// ------------------------------------------------------------------ Shared

USTRUCT()
struct FLBStat
{
	GENERATED_BODY()
	UPROPERTY() FString Stat;
	UPROPERTY() float Value = 0.f;
};

/** Condition used by dialogue, exits, shop stock and NPC visibility. Empty fields always pass. */
USTRUCT()
struct FLBCond
{
	GENERATED_BODY()
	UPROPERTY() FString Active;
	UPROPERTY() FString ActiveFrom;
	UPROPERTY() FString Done;
	UPROPERTY() FString NotDone;
	UPROPERTY() FString Available;
	UPROPERTY() FString Flag;
	UPROPERTY() FString NotFlag;
	UPROPERTY() FString Has;
};

USTRUCT()
struct FLBItemRef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() int32 Qty = 1;
	UPROPERTY() int32 Rarity = -1;
};

// ------------------------------------------------------------------ Weapons

USTRUCT()
struct FLBAttackDef
{
	GENERATED_BODY()
	UPROPERTY() FString Name;
	UPROPERTY() FString Kind; // melee | projectile
	UPROPERTY() FString Pose;
	UPROPERTY() float Damage = 1.f;
	UPROPERTY() float Windup = 0.1f;
	UPROPERTY() float Active = 0.1f;
	UPROPERTY() float Recovery = 0.25f;
	UPROPERTY() float ComboWindow = 0.35f;
	UPROPERTY() float Range = 2.4f;
	UPROPERTY() float Arc = 110.f;
	UPROPERTY() float Lunge = 0.8f;
	UPROPERTY() float Knockback = 1.5f;
	UPROPERTY() float Poise = 10.f;
	UPROPERTY() float Stamina = 8.f;
	UPROPERTY() float Bleed = 0.f;
	UPROPERTY() float ShockwaveRadius = 0.f;
	UPROPERTY() float ShockwaveDamage = 0.f;
	UPROPERTY() float ProjSpeed = 0.f;
	UPROPERTY() int32 ProjCount = 0;
	UPROPERTY() float ProjSpread = 0.f;
	UPROPERTY() bool ProjPierce = false;
	UPROPERTY() float ProjRadius = 0.f;

	float Total() const { return Windup + Active + Recovery; }
};

USTRUCT()
struct FLBAbilityDef
{
	GENERATED_BODY()
	UPROPERTY() FString Kind;
	UPROPERTY() FString Name;
	UPROPERTY() FString Description;
	UPROPERTY() float Cost = 30.f;
	UPROPERTY() float Cooldown = 5.f;
	UPROPERTY() float Damage = 1.f;
	UPROPERTY() float Radius = 2.f;
	UPROPERTY() float Duration = 0.5f;
};

USTRUCT()
struct FLBWeaponFamily
{
	GENERATED_BODY()
	UPROPERTY() FString Type;
	UPROPERTY() FString Name;
	UPROPERTY() FString Description;
	UPROPERTY() float MoveSpeed = 1.f;
	UPROPERTY() TArray<FLBAttackDef> Light;
	UPROPERTY() FLBAttackDef Heavy;
	UPROPERTY() FLBAbilityDef Ability;
};

USTRUCT()
struct FLBWeaponsFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FLBWeaponFamily> Weapons;
};

// ------------------------------------------------------------------ Items

USTRUCT()
struct FLBItemDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Name;
	UPROPERTY() FString Kind; // weapon | armor | charm | consumable | material | key
	UPROPERTY() FString Description;
	UPROPERTY() int32 Value = 0;
	UPROPERTY() int32 Tier = 1;
	UPROPERTY() FString WeaponType;
	UPROPERTY() TArray<FLBStat> BaseStats;
	UPROPERTY() TArray<FLBStat> FixedAffixes;
	UPROPERTY() bool Stackable = false;
	UPROPERTY() int32 MaxStack = 1;
	UPROPERTY() float UseHeal = 0.f;
	UPROPERTY() float UseSpirit = 0.f;
	UPROPERTY() float UseBuffAtk = 0.f;
	UPROPERTY() float UseBuffTime = 0.f;
	UPROPERTY() int32 FixedRarity = -1;

	bool IsEquipment() const { return Kind == TEXT("weapon") || Kind == TEXT("armor") || Kind == TEXT("charm"); }
};

USTRUCT()
struct FLBItemsFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FLBItemDef> Items;
};

// ------------------------------------------------------------------ Enemies

USTRUCT()
struct FLBEnemyAttack
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Name;
	UPROPERTY() FString Kind;
	UPROPERTY() float Windup = 0.6f;
	UPROPERTY() float Active = 0.15f;
	UPROPERTY() float Recovery = 0.6f;
	UPROPERTY() float Damage = 1.f;
	UPROPERTY() float Range = 2.f;
	UPROPERTY() float MinRange = 0.f;
	UPROPERTY() float Arc = 90.f;
	UPROPERTY() float Radius = 0.f;
	UPROPERTY() float Cooldown = 1.5f;
	UPROPERTY() float Weight = 1.f;
	UPROPERTY() int32 Phase = 1;
	UPROPERTY() int32 Count = 1;
	UPROPERTY() float Speed = 0.f;
	UPROPERTY() float Spread = 0.f;
	UPROPERTY() FString StatusType;
	UPROPERTY() float StatusTime = 0.f;
	UPROPERTY() FString SummonEnemy;
	UPROPERTY() int32 SummonCount = 0;
	UPROPERTY() FString Callout;
	UPROPERTY() float Interval = 0.f;
};

USTRUCT()
struct FLBDrop
{
	GENERATED_BODY()
	UPROPERTY() FString Item;
	UPROPERTY() float Chance = 0.f;
	UPROPERTY() int32 QtyMin = 1;
	UPROPERTY() int32 QtyMax = 1;
};

USTRUCT()
struct FLBEnemyDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Name;
	UPROPERTY() FString Model;
	UPROPERTY() FString Behavior;
	UPROPERTY() float Hp = 10.f;
	UPROPERTY() float Atk = 1.f;
	UPROPERTY() float Def = 0.f;
	UPROPERTY() float Speed = 3.f;
	UPROPERTY() float Radius = 0.5f;
	UPROPERTY() float Scale = 1.f;
	UPROPERTY() float Poise = 10.f;
	UPROPERTY() float AggroRange = 12.f;
	UPROPERTY() float Leash = 25.f;
	UPROPERTY() float PreferredRange = 0.f;
	UPROPERTY() bool Flying = false;
	UPROPERTY() bool SuperArmor = false;
	UPROPERTY() int32 Xp = 0;
	UPROPERTY() int32 CoinsMin = 0;
	UPROPERTY() int32 CoinsMax = 0;
	UPROPERTY() TArray<FLBDrop> Drops;
	UPROPERTY() float EquipChance = 0.f;
	UPROPERTY() float Evade = 0.f;
	UPROPERTY() bool IsBoss = false;
	UPROPERTY() FString BossTitle;
	UPROPERTY() TArray<float> PhaseThresholds;
	UPROPERTY() FString BossMusic;
	UPROPERTY() TArray<FString> BossReward;
	UPROPERTY() TArray<FLBEnemyAttack> Attacks;
};

USTRUCT()
struct FLBEnemiesFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FLBEnemyDef> Enemies;
};

// ------------------------------------------------------------------ Quests

USTRUCT()
struct FLBObjective
{
	GENERATED_BODY()
	UPROPERTY() FString Type;
	UPROPERTY() FString Target;
	UPROPERTY() int32 Count = 1;
	UPROPERTY() FString Text;
	UPROPERTY() FString Area;
	UPROPERTY() FString Waypoint;
	UPROPERTY() bool Consume = false;
	UPROPERTY() FString Hint;
};

USTRUCT()
struct FLBQuestDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Title;
	UPROPERTY() FString Kind;
	UPROPERTY() FString Giver;
	UPROPERTY() FString Summary;
	UPROPERTY() TArray<FString> Prereqs;
	UPROPERTY() TArray<FString> RequiresFlags;
	UPROPERTY() TArray<FLBObjective> Objectives;
	UPROPERTY() int32 RewardXp = 0;
	UPROPERTY() int32 RewardCoins = 0;
	UPROPERTY() TArray<FLBItemRef> RewardItems;
	UPROPERTY() TArray<FString> RewardFlags;
	UPROPERTY() TArray<FLBItemRef> StartItems;
	UPROPERTY() TArray<FString> Next;
};

USTRUCT()
struct FLBQuestsFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FLBQuestDef> Quests;
};

// ------------------------------------------------------------------ Dialogue

USTRUCT()
struct FLBDialogueChoice
{
	GENERATED_BODY()
	UPROPERTY() FString Text;
	UPROPERTY() FString Next;
	UPROPERTY() TArray<FString> Actions;
	UPROPERTY() FLBCond Cond;
};

USTRUCT()
struct FLBDialogueNode
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Speaker;
	UPROPERTY() FString Text;
	UPROPERTY() FString Next;
	UPROPERTY() TArray<FString> Actions;
	UPROPERTY() TArray<FLBDialogueChoice> Choices;
};

USTRUCT()
struct FLBDialogue
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Start;
	UPROPERTY() TArray<FLBDialogueNode> Nodes;

	const FLBDialogueNode* FindNode(const FString& NodeId) const
	{
		for (const FLBDialogueNode& N : Nodes)
		{
			if (N.Id == NodeId) return &N;
		}
		return nullptr;
	}
};

USTRUCT()
struct FLBNpcDialogueEntry
{
	GENERATED_BODY()
	UPROPERTY() FLBCond Cond;
	UPROPERTY() FString Dialogue;
	UPROPERTY() FString Quest;
	UPROPERTY() bool NoTalk = false;
};

USTRUCT()
struct FLBNpcDialogue
{
	GENERATED_BODY()
	UPROPERTY() FString Npc;
	UPROPERTY() TArray<FLBNpcDialogueEntry> Entries;
};

USTRUCT()
struct FLBNameEntry
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Name;
};

USTRUCT()
struct FLBBossLines
{
	GENERATED_BODY()
	UPROPERTY() FString Boss;
	UPROPERTY() TArray<FString> Intro;
	UPROPERTY() TArray<FString> Phase;
	UPROPERTY() FString Defeat;
};

USTRUCT()
struct FLBLine
{
	GENERATED_BODY()
	UPROPERTY() FString Speaker;
	UPROPERTY() FString Text;
};

USTRUCT()
struct FLBDialogueFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FLBDialogue> Dialogues;
	UPROPERTY() TArray<FLBNpcDialogue> NpcDialogue;
	UPROPERTY() TArray<FLBNameEntry> NpcNames;
	UPROPERTY() TArray<FLBBossLines> BossLines;
	UPROPERTY() TArray<FLBLine> Ending;
};

// ------------------------------------------------------------------ Skills & shop

USTRUCT()
struct FLBSkillDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Name;
	UPROPERTY() FString Description;
	UPROPERTY() int32 MaxRank = 1;
	UPROPERTY() TArray<FLBStat> PerRank;
	UPROPERTY() FString Special;
	UPROPERTY() int32 RequiresLevel = 0;
};

USTRUCT()
struct FLBShopEntry
{
	GENERATED_BODY()
	UPROPERTY() FString Item;
	UPROPERTY() int32 Price = 0;
	UPROPERTY() int32 Rarity = -1;
	UPROPERTY() FLBCond Requires;
	UPROPERTY() bool Once = false;
};

USTRUCT()
struct FLBSkillsFile
{
	GENERATED_BODY()
	UPROPERTY() TArray<FLBSkillDef> Skills;
	UPROPERTY() TArray<FLBShopEntry> Shop;
};

// ------------------------------------------------------------------ Areas

USTRUCT()
struct FLBColliderDef
{
	GENERATED_BODY()
	UPROPERTY() FString Kind; // circle | box
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() float R = 0.f;
	UPROPERTY() float MinX = 0.f;
	UPROPERTY() float MaxX = 0.f;
	UPROPERTY() float MinZ = 0.f;
	UPROPERTY() float MaxZ = 0.f;
	UPROPERTY() float H = 3.f;
	UPROPERTY() FString Id;
	UPROPERTY() FString Tag;
};

USTRUCT()
struct FLBSpawnDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() float Yaw = 0.f;
};

USTRUCT()
struct FLBMarkerDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() float R = 1.f;
};

USTRUCT()
struct FLBExitDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() float R = 3.f;
	UPROPERTY() FString To;
	UPROPERTY() FString Spawn;
	UPROPERTY() FString Label;
	UPROPERTY() FLBCond Requires;
	UPROPERTY() FString LockedText;
};

USTRUCT()
struct FLBInteractDef
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Kind; // chest | brazier | wayshrine | seal | lantern
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() float Yaw = 0.f;
	UPROPERTY() FLBCond Requires;
	UPROPERTY() int32 LootCoins = 0;
	UPROPERTY() TArray<FLBItemRef> LootItems;
	UPROPERTY() int32 LootEquipTier = 0;
	UPROPERTY() float LootRarityLuck = 0.f;
};

USTRUCT()
struct FLBNpcPlace
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() float Yaw = 0.f;
	UPROPERTY() FLBCond ShowIf;
};

USTRUCT()
struct FLBEnemySpawn
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Enemy;
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() int32 Level = 1;
	UPROPERTY() float Respawn = 0.f;
};

USTRUCT()
struct FLBBossPlace
{
	GENERATED_BODY()
	UPROPERTY() FString Enemy;
	UPROPERTY() float X = 0.f;
	UPROPERTY() float Z = 0.f;
	UPROPERTY() float Yaw = 0.f;
	UPROPERTY() float ArenaX = 0.f;
	UPROPERTY() float ArenaZ = 0.f;
	UPROPERTY() float ArenaR = 10.f;
	UPROPERTY() float TriggerX = 0.f;
	UPROPERTY() float TriggerZ = 0.f;
	UPROPERTY() float TriggerR = 8.f;
	UPROPERTY() float GateX = 0.f;
	UPROPERTY() float GateZ = 0.f;
	UPROPERTY() float GateWidth = 6.f;
};

USTRUCT()
struct FLBEnvDef
{
	GENERATED_BODY()
	UPROPERTY() int32 SkyTop = 0;
	UPROPERTY() int32 SkyBottom = 0;
	UPROPERTY() int32 FogColor = 0;
	UPROPERTY() float FogNear = 20.f;
	UPROPERTY() float FogFar = 100.f;
	UPROPERTY() int32 SunColor = 0xffffff;
	UPROPERTY() float SunIntensity = 2.f;
	UPROPERTY() float SunDirX = 0.f;
	UPROPERTY() float SunDirY = 1.f;
	UPROPERTY() float SunDirZ = 0.f;
	UPROPERTY() int32 HemiSky = 0xffffff;
	UPROPERTY() int32 HemiGround = 0x444444;
	UPROPERTY() float LanternIntensity = 1.5f;
};

USTRUCT()
struct FLBAreaData
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() FString Name;
	UPROPERTY() float Size = 100.f;
	UPROPERTY() bool Indoor = false;
	UPROPERTY() float GridStep = 2.f;
	UPROPERTY() int32 GridN = 0;
	UPROPERTY() float GridOrigin = 0.f;
	UPROPERTY() TArray<float> Heights;
	UPROPERTY() TArray<int32> Walkable;
	UPROPERTY() TArray<int32> Colors;
	UPROPERTY() TArray<FLBColliderDef> Colliders;
	UPROPERTY() TArray<FLBSpawnDef> Spawns;
	UPROPERTY() TArray<FLBMarkerDef> Markers;
	UPROPERTY() TArray<FLBExitDef> Exits;
	UPROPERTY() TArray<FLBInteractDef> Interactables;
	UPROPERTY() TArray<FLBNpcPlace> Npcs;
	UPROPERTY() TArray<FLBEnemySpawn> Enemies;
	UPROPERTY() bool HasBoss = false;
	UPROPERTY() FLBBossPlace Boss;
	UPROPERTY() FLBEnvDef Env;
	UPROPERTY() FString Music;
	UPROPERTY() int32 Tier = 1;
	UPROPERTY() bool HasWater = false;
	UPROPERTY() float WaterLevel = 0.f;
	UPROPERTY() float WaterSlow = 1.f;

	/** Bilinear height (metres) at game coordinates (x, z). */
	float HeightAt(float X, float Z) const
	{
		if (GridN <= 1 || Heights.Num() < GridN * GridN) return 0.f;
		const float Fx = FMath::Clamp((X - GridOrigin) / GridStep, 0.f, float(GridN - 1) - 0.001f);
		const float Fz = FMath::Clamp((Z - GridOrigin) / GridStep, 0.f, float(GridN - 1) - 0.001f);
		const int32 I = FMath::FloorToInt(Fx);
		const int32 J = FMath::FloorToInt(Fz);
		const float Tx = Fx - I;
		const float Tz = Fz - J;
		const float H00 = Heights[J * GridN + I];
		const float H10 = Heights[J * GridN + I + 1];
		const float H01 = Heights[(J + 1) * GridN + I];
		const float H11 = Heights[(J + 1) * GridN + I + 1];
		return FMath::Lerp(FMath::Lerp(H00, H10, Tx), FMath::Lerp(H01, H11, Tx), Tz);
	}

	bool IsWalkable(float X, float Z) const
	{
		if (GridN <= 1 || Walkable.Num() < GridN * GridN) return true;
		const int32 I = FMath::RoundToInt((X - GridOrigin) / GridStep);
		const int32 J = FMath::RoundToInt((Z - GridOrigin) / GridStep);
		if (I < 0 || J < 0 || I >= GridN || J >= GridN) return false;
		return Walkable[J * GridN + I] != 0;
	}

	const FLBSpawnDef* FindSpawn(const FString& SpawnId) const
	{
		for (const FLBSpawnDef& S : Spawns)
		{
			if (S.Id == SpawnId) return &S;
		}
		return nullptr;
	}

	const FLBMarkerDef* FindMarker(const FString& MarkerId) const
	{
		for (const FLBMarkerDef& M : Markers)
		{
			if (M.Id == MarkerId) return &M;
		}
		return nullptr;
	}
};

// ------------------------------------------------------------------ Save data

USTRUCT()
struct FLBItemInstance
{
	GENERATED_BODY()
	UPROPERTY() FString Uid;
	UPROPERTY() FString Id;
	UPROPERTY() int32 Qty = 1;
	UPROPERTY() int32 Rarity = 0;
	UPROPERTY() int32 Level = 0;
	UPROPERTY() TArray<FLBStat> Affixes;
};

USTRUCT()
struct FLBQuestState
{
	GENERATED_BODY()
	UPROPERTY() FString Id;
	UPROPERTY() int32 Stage = 0;
	UPROPERTY() int32 Progress = 0;
};

/** Everything that goes into a save file. */
USTRUCT()
struct FLBGameData
{
	GENERATED_BODY()
	UPROPERTY() int32 Version = 1;
	UPROPERTY() int32 Level = 1;
	UPROPERTY() int32 Xp = 0;
	UPROPERTY() int32 Coins = 30;
	UPROPERTY() int32 SkillPoints = 0;
	UPROPERTY() float HpFrac = 1.f;
	UPROPERTY() float Spirit = 0.f;
	UPROPERTY() TMap<FString, int32> Skills;
	UPROPERTY() FString Area = TEXT("village");
	UPROPERTY() FString Spawn = TEXT("start");
	UPROPERTY() FString Weapon1;
	UPROPERTY() FString Weapon2;
	UPROPERTY() FString Armor;
	UPROPERTY() FString Charm;
	UPROPERTY() int32 ActiveWeapon = 0;
	UPROPERTY() TArray<FLBItemInstance> Inventory;
	UPROPERTY() TArray<FLBQuestState> ActiveQuests;
	UPROPERTY() TArray<FString> CompletedQuests;
	UPROPERTY() FString TrackedQuest;
	UPROPERTY() TMap<FString, int32> Flags;
	UPROPERTY() TArray<FString> OpenedChests;
	UPROPERTY() TArray<FString> LitBraziers;
	UPROPERTY() TArray<FString> BossesDefeated;
	UPROPERTY() TArray<FString> VisitedAreas;
	UPROPERTY() int32 Kills = 0;
	UPROPERTY() int32 Deaths = 0;
	UPROPERTY() float PlayTime = 0.f;
	UPROPERTY() int32 NextUid = 1;
	UPROPERTY() bool bEnding = false;
};

/** Derived combat stats. */
struct FLBStats
{
	float MaxHp = 120.f;
	float Atk = 8.f;
	float AtkPct = 0.f;
	float Def = 2.f;
	float Crit = 0.05f;
	float CritDmg = 0.5f;
	float StaminaRegen = 0.f;
	float SpiritGain = 0.f;
	float MoveSpeed = 0.f;
	float Lifesteal = 0.f;
	float BurnChance = 0.f;
	float MaxStamina = 100.f;
	float MaxSpirit = 100.f;
};
