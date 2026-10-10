// Game mode: no pawn is spawned (characters are driven by FLBGame); it owns
// the game orchestrator and ticks it after the player controller has polled
// input each frame.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "LBGameMode.generated.h"

class FLBGame;
class ULBAudio;

UCLASS()
class LANTERNBOUND_API ALBGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ALBGameMode();
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void PostLogin(APlayerController* NewPlayer) override;
	/** Characters are not pawns; nothing to spawn for the player. */
	virtual void RestartPlayer(AController* NewPlayer) override {}

	FLBGame* GetGame() const { return Game; }

	UPROPERTY() ULBAudio* Audio = nullptr;

private:
	FLBGame* Game = nullptr;
	bool bStarted = false;
};
