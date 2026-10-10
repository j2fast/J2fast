#include "LBData.h"
#include "Lanternbound.h"
#include "JsonObjectConverter.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"

FString ULBData::DataDir() const
{
	return FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Data"));
}

bool ULBData::LoadFile(const FString& Name, FString& OutText)
{
	const FString Path = FPaths::Combine(DataDir(), Name + TEXT(".json"));
	if (!FFileHelper::LoadFileToString(OutText, *Path))
	{
		LoadError += FString::Printf(TEXT("Missing data file: %s\n"), *Path);
		UE_LOG(LogLanternbound, Error, TEXT("Missing data file %s"), *Path);
		return false;
	}
	return true;
}

template <typename T>
static bool ParseInto(const FString& Text, T& Out)
{
	return FJsonObjectConverter::JsonObjectStringToUStruct(Text, &Out);
}

void ULBData::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	FString Text;

	if (LoadFile(TEXT("weapons"), Text))
	{
		FLBWeaponsFile F;
		if (ParseInto(Text, F))
			for (const FLBWeaponFamily& W : F.Weapons) Weapons.Add(W.Type, W);
		else LoadError += TEXT("weapons.json could not be parsed\n");
	}
	if (LoadFile(TEXT("items"), Text))
	{
		FLBItemsFile F;
		if (ParseInto(Text, F))
			for (const FLBItemDef& I : F.Items) Items.Add(I.Id, I);
		else LoadError += TEXT("items.json could not be parsed\n");
	}
	if (LoadFile(TEXT("enemies"), Text))
	{
		FLBEnemiesFile F;
		if (ParseInto(Text, F))
			for (const FLBEnemyDef& E : F.Enemies) Enemies.Add(E.Id, E);
		else LoadError += TEXT("enemies.json could not be parsed\n");
	}
	if (LoadFile(TEXT("quests"), Text))
	{
		FLBQuestsFile F;
		if (ParseInto(Text, F))
		{
			for (const FLBQuestDef& Q : F.Quests)
			{
				Quests.Add(Q.Id, Q);
				QuestOrder.Add(Q.Id);
			}
		}
		else LoadError += TEXT("quests.json could not be parsed\n");
	}
	if (LoadFile(TEXT("dialogue"), Text))
	{
		FLBDialogueFile F;
		if (ParseInto(Text, F))
		{
			for (const FLBDialogue& D : F.Dialogues) Dialogues.Add(D.Id, D);
			for (const FLBNpcDialogue& N : F.NpcDialogue) NpcDialogue.Add(N.Npc, N.Entries);
			for (const FLBNameEntry& N : F.NpcNames) NpcNames.Add(N.Id, N.Name);
			for (const FLBBossLines& B : F.BossLines) BossLines.Add(B.Boss, B);
			Ending = F.Ending;
		}
		else LoadError += TEXT("dialogue.json could not be parsed\n");
	}
	if (LoadFile(TEXT("skills"), Text))
	{
		FLBSkillsFile F;
		if (ParseInto(Text, F))
		{
			Skills = F.Skills;
			Shop = F.Shop;
		}
		else LoadError += TEXT("skills.json could not be parsed\n");
	}
	UE_LOG(LogLanternbound, Log, TEXT("Loaded data: %d weapons, %d items, %d enemies, %d quests, %d dialogues"),
		Weapons.Num(), Items.Num(), Enemies.Num(), Quests.Num(), Dialogues.Num());
}

const FLBAreaData* ULBData::GetArea(const FString& AreaId)
{
	if (const TSharedPtr<FLBAreaData>* Cached = AreaCache.Find(AreaId)) return Cached->Get();
	FString Text;
	if (!LoadFile(TEXT("area_") + AreaId, Text)) return nullptr;
	TSharedPtr<FLBAreaData> Area = MakeShared<FLBAreaData>();
	if (!ParseInto(Text, *Area))
	{
		LoadError += FString::Printf(TEXT("area_%s.json could not be parsed\n"), *AreaId);
		return nullptr;
	}
	AreaCache.Add(AreaId, Area);
	return Area.Get();
}

const FLBSkillDef* ULBData::Skill(const FString& Id) const
{
	for (const FLBSkillDef& S : Skills)
	{
		if (S.Id == Id) return &S;
	}
	return nullptr;
}

FString ULBData::NpcName(const FString& Id) const
{
	if (const FString* N = NpcNames.Find(Id)) return *N;
	return Id;
}

ULBData* ULBData::Get(const UObject* WorldContext)
{
	const UWorld* World = WorldContext ? WorldContext->GetWorld() : nullptr;
	UGameInstance* GI = World ? World->GetGameInstance() : nullptr;
	return GI ? GI->GetSubsystem<ULBData>() : nullptr;
}
