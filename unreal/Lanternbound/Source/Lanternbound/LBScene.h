// Loader for the binary scenery meshes exported from the web build
// (Content/Data/*.lbm, written by src/tools/meshExport.ts). Each file holds
// "parts": the unnamed static scenery plus every named object (doors, cages,
// lantern cores...) so the game can move, hide or recolour them.

#pragma once

#include "CoreMinimal.h"
#include "LBMeshKit.h"

class AActor;
class USceneComponent;
class UProceduralMeshComponent;

struct FLBSceneSection
{
	ELBMat Kind = ELBMat::Lit;
	bool bCastShadow = false;
	TArray<FVector> Verts;
	TArray<FVector> Normals;
	TArray<FColor> Colors;
};

struct FLBScenePart
{
	FString Name;
	bool bVisible = true;
	FVector Location = FVector::ZeroVector;
	float Yaw = 0.f;
	float Scale = 1.f;
	TArray<FLBSceneSection> Sections;
};

/** A spawned part: a pivot component with one or more mesh components under it. */
struct FLBSpawnedPart
{
	FString Name;
	USceneComponent* Pivot = nullptr;
	TArray<UProceduralMeshComponent*> Meshes;
	FVector BaseLocation = FVector::ZeroVector;
	float BaseYaw = 0.f;
	float BaseScale = 1.f;

	void SetVisible(bool bVisible) const;
};

namespace LBScene
{
	/** Reads an .lbm file from Content/Data. Instanced sections are expanded. Returns false on error. */
	LANTERNBOUND_API bool Load(const FString& FileName, TArray<FLBScenePart>& OutParts, FString& OutError);

	/**
	 * Creates components for a part under Parent. Large unnamed scenery is split into tiles of
	 * TileSize cm so the renderer can cull it. Collision is never created (movement uses the
	 * exported colliders, like the web build).
	 */
	LANTERNBOUND_API FLBSpawnedPart Spawn(AActor* Owner, USceneComponent* Parent, const FLBScenePart& Part, float TileSize = 0.f);

	/** When true (DefaultGame.ini [Lanternbound] bFlipWinding=True), all triangles are reversed. */
	LANTERNBOUND_API bool FlipWinding();
}
