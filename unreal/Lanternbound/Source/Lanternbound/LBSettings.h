// Player settings (port of src/core/settings.ts and bindings.ts). Stored in
// their own save slot so accessibility choices apply to every save.

#pragma once

#include "CoreMinimal.h"
#include "LBSettings.generated.h"

/** Input actions, same set and order as the web build. */
enum class ELBAction : uint8
{
	MoveForward,
	MoveBack,
	MoveLeft,
	MoveRight,
	LookLeft,
	LookRight,
	LookUp,
	LookDown,
	Sprint,
	Dodge,
	Attack,
	Heavy,
	Ability,
	Interact,
	Heal,
	LockOn,
	TargetNext,
	SwapWeapon,
	QuestLog,
	Inventory,
	Pause,
	Count
};

constexpr int32 LBActionCount = int32(ELBAction::Count);

USTRUCT()
struct FLBBinding
{
	GENERATED_BODY()
	/** Keyboard / mouse keys (Unreal FKey names), at most two. */
	UPROPERTY() TArray<FString> Keys;
	/** Gamepad keys (Unreal FKey names), at most two. */
	UPROPERTY() TArray<FString> Pad;
};

USTRUCT()
struct FLBSettings
{
	GENERATED_BODY()
	UPROPERTY() int32 Version = 1;
	UPROPERTY() float MasterVolume = 0.8f;
	UPROPERTY() float MusicVolume = 0.6f;
	UPROPERTY() float SfxVolume = 0.8f;
	UPROPERTY() float MouseSensitivity = 1.f;
	UPROPERTY() float StickSensitivity = 1.f;
	UPROPERTY() bool bInvertY = false;
	UPROPERTY() float Fov = 70.f;
	UPROPERTY() bool bCameraShake = true;
	UPROPERTY() bool bReduceFlashing = false;
	UPROPERTY() bool bHighContrastTelegraphs = false;
	UPROPERTY() bool bDamageNumbers = true;
	UPROPERTY() bool bSubtitles = true;
	/** 0 small, 1 medium, 2 large, 3 extra large */
	UPROPERTY() int32 SubtitleSize = 1;
	UPROPERTY() float SubtitleBackground = 0.6f;
	UPROPERTY() bool bSoundCaptions = false;
	UPROPERTY() bool bLockOnHold = false;
	UPROPERTY() bool bAutoFaceTarget = true;
	/** 0 story, 1 normal, 2 hard */
	UPROPERTY() int32 Difficulty = 1;
	/** 0 low, 1 medium, 2 high, 3 epic (Unreal scalability) */
	UPROPERTY() int32 Quality = 2;
	UPROPERTY() bool bFullscreen = false;
	/** Exposure compensation in stops. */
	UPROPERTY() float Brightness = 0.f;
	UPROPERTY() bool bShowFps = false;
	UPROPERTY() bool bCompanionEnabled = true;
	/** Indexed by ELBAction. */
	UPROPERTY() TArray<FLBBinding> Bindings;
};

namespace LBInput
{
	LANTERNBOUND_API const TCHAR* ActionId(ELBAction A);
	LANTERNBOUND_API FString ActionLabel(ELBAction A);
	LANTERNBOUND_API bool IsRequired(ELBAction A);
	LANTERNBOUND_API TArray<FLBBinding> DefaultBindings();
	/** Display name for a key, e.g. "LMB", "Space", "A". */
	LANTERNBOUND_API FString KeyName(const FString& Key);
	/**
	 * Binds Key to Action (keyboard or pad list chosen by bPad). Any other action using
	 * the key loses it; returns those actions so the UI can say what changed.
	 */
	LANTERNBOUND_API TArray<ELBAction> Rebind(TArray<FLBBinding>& Bindings, ELBAction Action, const FString& Key, bool bPad);
}

namespace LBSettingsUtil
{
	LANTERNBOUND_API FLBSettings Defaults();
	/** Clamps every field and repairs bindings (used after loading). */
	LANTERNBOUND_API void Sanitize(FLBSettings& S);
	LANTERNBOUND_API float EnemyDamageMult(const FLBSettings& S);
	LANTERNBOUND_API float EnemyHealthMult(const FLBSettings& S);
	LANTERNBOUND_API FString DifficultyName(int32 D);
}
