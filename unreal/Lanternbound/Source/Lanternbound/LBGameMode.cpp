#include "LBGameMode.h"
#include "LBGame.h"
#include "LBAudio.h"
#include "LBHUD.h"
#include "LBPlayerController.h"
#include "GameFramework/PlayerController.h"

ALBGameMode::ALBGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bTickEvenWhenPaused = true;
	PlayerControllerClass = ALBPlayerController::StaticClass();
	HUDClass = ALBHUD::StaticClass();
	DefaultPawnClass = nullptr;
	SpectatorClass = nullptr;
}

void ALBGameMode::BeginPlay()
{
	Super::BeginPlay();
	Audio = NewObject<ULBAudio>(this);
	Game = new FLBGame(this);
}

void ALBGameMode::PostLogin(APlayerController* NewPlayer)
{
	Super::PostLogin(NewPlayer);
	// Run the game after the controller has polled this frame's input.
	if (NewPlayer) AddTickPrerequisiteActor(NewPlayer);
}

void ALBGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!Game) return;
	if (!bStarted)
	{
		// Wait for the local player controller before starting.
		if (!GetWorld() || !GetWorld()->GetFirstPlayerController()) return;
		bStarted = true;
		Game->Begin();
	}
	Game->Tick(DeltaSeconds);
}

void ALBGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
	delete Game;
	Game = nullptr;
	Super::EndPlay(Reason);
}
