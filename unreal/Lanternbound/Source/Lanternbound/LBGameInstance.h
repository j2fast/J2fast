// Game instance: holds the settings for the whole session (the game data
// subsystem ULBData hangs off it too).

#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "LBSettings.h"
#include "LBGameInstance.generated.h"

UCLASS()
class LANTERNBOUND_API ULBGameInstance : public UGameInstance
{
	GENERATED_BODY()

public:
	virtual void Init() override;

	FLBSettings Settings;
	void PersistSettings();
	/** Applies display settings (scalability, window mode). */
	void ApplyDisplaySettings();

	static ULBGameInstance* Get(const UObject* WorldContext);
};
