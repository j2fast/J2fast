#include "LBGameInstance.h"
#include "LBSave.h"
#include "GameFramework/GameUserSettings.h"
#include "Engine/Engine.h"
#include "Engine/World.h"

void ULBGameInstance::Init()
{
	Super::Init();
	Settings = LBSaves::LoadSettings();
	ApplyDisplaySettings();
}

void ULBGameInstance::PersistSettings()
{
	LBSettingsUtil::Sanitize(Settings);
	LBSaves::SaveSettings(Settings);
	ApplyDisplaySettings();
}

void ULBGameInstance::ApplyDisplaySettings()
{
	if (!GEngine) return;
	// Only touch the engine settings when the display options actually changed.
	static int32 LastQuality = -1;
	static int32 LastFullscreen = -1;
	if (LastQuality == Settings.Quality && LastFullscreen == int32(Settings.bFullscreen)) return;
	LastQuality = Settings.Quality;
	LastFullscreen = int32(Settings.bFullscreen);
	if (UGameUserSettings* U = GEngine->GetGameUserSettings())
	{
		U->SetOverallScalabilityLevel(Settings.Quality);
		if (GIsEditor)
		{
			// Play-in-editor: leave the editor window alone.
			U->ApplyNonResolutionSettings();
			return;
		}
		const EWindowMode::Type Want = Settings.bFullscreen ? EWindowMode::WindowedFullscreen : EWindowMode::Windowed;
		if (U->GetFullscreenMode() != Want) U->SetFullscreenMode(Want);
		U->ApplySettings(false);
	}
}

ULBGameInstance* ULBGameInstance::Get(const UObject* WorldContext)
{
	const UWorld* World = WorldContext ? WorldContext->GetWorld() : nullptr;
	return World ? Cast<ULBGameInstance>(World->GetGameInstance()) : nullptr;
}
