// A bare actor used to host the procedural meshes of a character, projectile
// or pickup. Gameplay logic lives in plain C++ classes (see LBEntities.h).

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Engine/World.h"
#include "LBVisual.generated.h"

class UPointLightComponent;

UCLASS()
class LANTERNBOUND_API ALBVisual : public AActor
{
	GENERATED_BODY()

public:
	ALBVisual()
	{
		PrimaryActorTick.bCanEverTick = false;
		RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	}

	/** Places the actor at game coordinates (metres) with a game yaw (radians). */
	void Place(float X, float Y, float Z, float Yaw);
	/** Adds a point light (no shadows) at a local offset in centimetres. */
	UPointLightComponent* AddLight(const FVector& Local, int32 Color, float Intensity, float RadiusCm);
};

/** Destroys an actor unless the world is already being torn down (end of play). */
inline void LBSafeDestroy(AActor* A)
{
	if (IsValid(A) && A->GetWorld() && !A->GetWorld()->bIsTearingDown) A->Destroy();
}
