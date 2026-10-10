// Procedural audio (port of src/core/audio.ts and src/core/music.ts). Every
// sound effect and every music track is synthesised into PCM at startup and
// played through USoundWaveProcedural, so the project needs no audio assets.
// All melodies are the web build's original compositions.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "LBAudio.generated.h"

class UAudioComponent;
class USoundWaveProcedural;

UCLASS()
class LANTERNBOUND_API ULBAudio : public UObject
{
	GENERATED_BODY()

public:
	/** Renders all sound effects (music tracks render on first use). */
	void Init(UWorld* InWorld);
	void SetVolumes(float Master, float Music, float Sfx);
	void SetListener(float X, float Z, float Yaw) { ListenerX = X; ListenerZ = Z; ListenerYaw = Yaw; }

	/** Plays a sound effect by name (same names as the web build). Positional when bPositional. */
	void Play(const FString& Name, float X = 0.f, float Z = 0.f, float Volume = 1.f, bool bPositional = false);
	/** Switches music track with a short crossfade ("" stops). */
	void PlayMusic(const FString& Track);
	void SetCombat(bool bActive) { CombatTarget = bActive ? 1.f : 0.f; }
	/** Keeps looping music fed and applies fades; call every frame. */
	void Tick(float Dt);

	/** Caption shown for important sounds when sound captions are enabled. */
	TFunction<void(const FString&)> OnCaption;

private:
	struct FTrackAudio
	{
		TSharedPtr<TArray<int16>> Base;
		TSharedPtr<TArray<int16>> Combat;
	};
	struct FMusicPlayer
	{
		FString Track;
		USoundWaveProcedural* BaseWave = nullptr;
		USoundWaveProcedural* CombatWave = nullptr;
		UAudioComponent* BaseComp = nullptr;
		UAudioComponent* CombatComp = nullptr;
		TSharedPtr<TArray<int16>> BaseData;
		TSharedPtr<TArray<int16>> CombatData;
		float Fade = 0.f;
		float FadeTarget = 1.f;
	};

	UPROPERTY() TArray<UObject*> Keep;
	UWorld* World = nullptr;
	TMap<FString, TArray<TSharedPtr<TArray<int16>>>> Sfx;
	TMap<FString, FTrackAudio> Tracks;
	TMap<FString, double> LastPlayed;
	TArray<FMusicPlayer> Players;
	struct FVoice
	{
		UAudioComponent* Comp = nullptr;
		USoundWaveProcedural* Wave = nullptr;
		double EndTime = 0.0;
	};
	TArray<FVoice> Voices;
	float MasterVol = 0.8f, MusicVol = 0.6f, SfxVol = 0.8f;
	float ListenerX = 0.f, ListenerZ = 0.f, ListenerYaw = 0.f;
	float CombatTarget = 0.f, Combat = 0.f;

	USoundWaveProcedural* MakeWave(const TArray<int16>& Pcm, bool bLooping);
	UAudioComponent* MakeComponent(USoundWaveProcedural* Wave);
	void StopPlayer(FMusicPlayer& P);
	const FTrackAudio* GetTrack(const FString& Name);
};
