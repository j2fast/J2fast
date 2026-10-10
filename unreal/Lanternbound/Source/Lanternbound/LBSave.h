// Save files (port of src/systems/save.ts): four slots (autosave + 3 manual),
// each with a backup copy, plus a separate settings save.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "LBTypes.h"
#include "LBSettings.h"
#include "LBSave.generated.h"

UCLASS()
class LANTERNBOUND_API ULBSaveGame : public USaveGame
{
	GENERATED_BODY()
public:
	UPROPERTY() FString Format = TEXT("lanternbound-save");
	UPROPERTY() FLBGameData Data;
};

UCLASS()
class LANTERNBOUND_API ULBSettingsSave : public USaveGame
{
	GENERATED_BODY()
public:
	UPROPERTY() FLBSettings Settings;
};

struct FLBSlotSummary
{
	FString Slot;
	bool bExists = false;
	bool bCorrupt = false;
	int32 Level = 0;
	FString Area;
	float PlayTime = 0.f;
	int64 SavedAt = 0;
	FString Quest;
	bool bEnding = false;
};

namespace LBSaves
{
	/** "auto", "1", "2", "3" */
	LANTERNBOUND_API const TArray<FString>& Slots();
	LANTERNBOUND_API bool Save(const FString& Slot, FLBGameData& Data);
	/** Loads a slot (falling back to its backup). Returns false with Error on failure. */
	LANTERNBOUND_API bool Load(const FString& Slot, FLBGameData& OutData, TArray<FString>& OutWarnings, FString& OutError);
	LANTERNBOUND_API void Delete(const FString& Slot);
	LANTERNBOUND_API FLBSlotSummary Summary(const FString& Slot);
	/** Most recently saved valid slot, or "" when none. */
	LANTERNBOUND_API FString Latest();
	LANTERNBOUND_API FLBSettings LoadSettings();
	LANTERNBOUND_API bool SaveSettings(const FLBSettings& S);
}
