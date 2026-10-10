#include "LBSave.h"
#include "LBData.h"
#include "LBRules.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/Engine.h"

namespace
{
	FString SlotName(const FString& Slot) { return FString(TEXT("Lanternbound_")) + Slot; }
	FString BackupName(const FString& Slot) { return SlotName(Slot) + TEXT("_bak"); }
	const TCHAR* SettingsSlot = TEXT("Lanternbound_Settings");

	ULBSaveGame* TryLoad(const FString& Name)
	{
		if (!UGameplayStatics::DoesSaveGameExist(Name, 0)) return nullptr;
		ULBSaveGame* S = Cast<ULBSaveGame>(UGameplayStatics::LoadGameFromSlot(Name, 0));
		if (!S || S->Format != TEXT("lanternbound-save") || S->Data.Version < 1) return nullptr;
		return S;
	}
}

namespace LBSaves
{
	const TArray<FString>& Slots()
	{
		static const TArray<FString> S = {TEXT("auto"), TEXT("1"), TEXT("2"), TEXT("3")};
		return S;
	}

	bool Save(const FString& Slot, FLBGameData& Data)
	{
		Data.SavedAt = FDateTime::UtcNow().ToUnixTimestamp();
		// Keep the previous good copy as a backup.
		if (ULBSaveGame* Prev = TryLoad(SlotName(Slot))) UGameplayStatics::SaveGameToSlot(Prev, BackupName(Slot), 0);
		ULBSaveGame* Obj = Cast<ULBSaveGame>(UGameplayStatics::CreateSaveGameObject(ULBSaveGame::StaticClass()));
		if (!Obj) return false;
		Obj->Data = Data;
		return UGameplayStatics::SaveGameToSlot(Obj, SlotName(Slot), 0);
	}

	bool Load(const FString& Slot, FLBGameData& OutData, TArray<FString>& OutWarnings, FString& OutError)
	{
		ULBSaveGame* S = TryLoad(SlotName(Slot));
		bool bBackup = false;
		if (!S)
		{
			S = TryLoad(BackupName(Slot));
			bBackup = S != nullptr;
		}
		if (!S)
		{
			OutError = UGameplayStatics::DoesSaveGameExist(SlotName(Slot), 0) ? TEXT("The save file is damaged.") : TEXT("The slot is empty.");
			return false;
		}
		OutData = S->Data;
		if (bBackup) OutWarnings.Add(TEXT("Main save was damaged; loaded the backup copy."));
		return true;
	}

	void Delete(const FString& Slot)
	{
		UGameplayStatics::DeleteGameInSlot(SlotName(Slot), 0);
		UGameplayStatics::DeleteGameInSlot(BackupName(Slot), 0);
	}

	FLBSlotSummary Summary(const FString& Slot)
	{
		FLBSlotSummary Sum;
		Sum.Slot = Slot;
		Sum.bExists = UGameplayStatics::DoesSaveGameExist(SlotName(Slot), 0);
		if (!Sum.bExists) return Sum;
		FLBGameData D;
		TArray<FString> W;
		FString Err;
		if (!Load(Slot, D, W, Err))
		{
			Sum.bCorrupt = true;
			return Sum;
		}
		Sum.Level = D.Level;
		Sum.Area = FLBRules::AreaName(D.Area);
		Sum.PlayTime = D.PlayTime;
		Sum.SavedAt = D.SavedAt;
		Sum.bEnding = D.bEnding;
		if (D.bEnding) Sum.Quest = TEXT("Story complete");
		else if (!D.TrackedQuest.IsEmpty() && GEngine)
		{
			Sum.Quest = D.TrackedQuest;
			// Titles come from the data subsystem when a world is available.
			for (const FWorldContext& Ctx : GEngine->GetWorldContexts())
			{
				if (ULBData* Data = ULBData::Get(Ctx.World()))
				{
					if (const FLBQuestDef* Q = Data->Quests.Find(D.TrackedQuest)) Sum.Quest = Q->Title;
					break;
				}
			}
		}
		return Sum;
	}

	FString Latest()
	{
		FString Best;
		int64 BestTime = -1;
		for (const FString& S : Slots())
		{
			const FLBSlotSummary Sum = Summary(S);
			if (Sum.bExists && !Sum.bCorrupt && Sum.SavedAt > BestTime)
			{
				Best = S;
				BestTime = Sum.SavedAt;
			}
		}
		return Best;
	}

	FLBSettings LoadSettings()
	{
		FLBSettings S = LBSettingsUtil::Defaults();
		if (UGameplayStatics::DoesSaveGameExist(SettingsSlot, 0))
		{
			if (ULBSettingsSave* Obj = Cast<ULBSettingsSave>(UGameplayStatics::LoadGameFromSlot(SettingsSlot, 0))) S = Obj->Settings;
		}
		LBSettingsUtil::Sanitize(S);
		return S;
	}

	bool SaveSettings(const FLBSettings& S)
	{
		ULBSettingsSave* Obj = Cast<ULBSettingsSave>(UGameplayStatics::CreateSaveGameObject(ULBSettingsSave::StaticClass()));
		if (!Obj) return false;
		Obj->Settings = S;
		return UGameplayStatics::SaveGameToSlot(Obj, SettingsSlot, 0);
	}
}
