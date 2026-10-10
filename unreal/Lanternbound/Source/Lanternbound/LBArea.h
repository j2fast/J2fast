// One loaded area: scenery meshes, lights, sky and fog, interactable props,
// and the 2D collision used for movement (ported from src/world/world.ts and
// src/world/terrain.ts so characters move exactly as in the web build).

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "LBTypes.h"
#include "LBScene.h"
#include "LBArea.generated.h"

class UPointLightComponent;
class UDirectionalLightComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;
class UProceduralMeshComponent;
class ULBData;

/** A movement collider (copy of the area's colliders plus runtime ones). */
struct FLBCollider
{
	bool bCircle = true;
	float X = 0.f, Z = 0.f, R = 0.f;
	float MinX = 0.f, MaxX = 0.f, MinZ = 0.f, MaxZ = 0.f;
	float H = 3.f;
	FString Id;
	bool bDisabled = false;
};

struct FLBInteractObj
{
	FLBInteractDef Def;
	FLBSpawnedPart Visual;
	FString VisualName;
};

UCLASS()
class LANTERNBOUND_API ALBArea : public AActor
{
	GENERATED_BODY()

public:
	ALBArea();

	/** Builds everything for the area. Returns false (and fills Error) when data is missing. */
	bool Build(const FString& AreaId, const FLBGameData& G, FString& Error);

	const FLBAreaData* Data = nullptr;
	TArray<FLBCollider> Colliders;
	TArray<FLBInteractObj> Interactables;

	// ----------------------------------------------------------- Queries (game metres)
	float HeightAt(float X, float Z) const;
	/** Ground the characters stand on (never more than 0.45 m below the water surface). */
	float GroundY(float X, float Z) const;
	bool InWater(float X, float Z) const;
	/** Moves a circle, respecting walkable space, colliders and bounds. */
	FVector2D Move(float X, float Z, float Dx, float Dz, float Radius, bool* bOutBlocked = nullptr) const;
	/** Fraction (0..1) of the segment the camera can travel unobstructed. */
	float CameraClearance(const FVector2D& From, const FVector2D& To) const;
	bool InteractableAvailable(const FLBInteractDef& Def, const FLBGameData& G) const;
	FVector World(float X, float Z, float UpMetres = 0.f) const;

	// ----------------------------------------------------------- Dynamic state
	void RefreshDynamic(const FLBGameData& G);
	void SetLanternLit(bool bLit);
	void SetColliderEnabled(const FString& Id, bool bEnabled);
	void RemoveColliders(const FString& Id);
	void AddCircleCollider(float X, float Z, float R, float H, const FString& Id);
	void AddBoxCollider(float MinX, float MaxX, float MinZ, float MaxZ, float H, const FString& Id);

	/** Spawns a prop from props.lbm (chest_open, barrier...) at a world transform. */
	FLBSpawnedPart SpawnProp(const FString& Name, const FVector& Location, float YawDeg, const FVector& Scale = FVector(1.f));

	/** Keeps the sky dome and sun shadow centred on the camera / player. */
	void FollowView(const FVector& ViewLocation);
	/** Simple scenery animation (flickering fires, bobbing water). */
	void Animate(float Time);

	UPROPERTY() USceneComponent* SceneRoot = nullptr;
	UPROPERTY() UDirectionalLightComponent* Sun = nullptr;
	UPROPERTY() USkyLightComponent* SkyLight = nullptr;
	UPROPERTY() UExponentialHeightFogComponent* Fog = nullptr;
	UPROPERTY() UProceduralMeshComponent* SkyDome = nullptr;
	UPROPERTY() TArray<UPointLightComponent*> Lights;

private:
	TArray<FLBSpawnedPart> Parts;
	FLBSpawnedPart* FindPart(const FString& Name);
	UProceduralMeshComponent* LanternGlow = nullptr;
	UProceduralMeshComponent* BeaconGlow = nullptr;
	bool bLanternLit = false;
	void BuildSky();
	void BuildInteractable(const FLBInteractDef& Def, const FLBGameData& G);
	FString InteractVisualName(const FLBInteractDef& Def, const FLBGameData& G) const;
	static TArray<FLBScenePart>& PropTemplates();
};
