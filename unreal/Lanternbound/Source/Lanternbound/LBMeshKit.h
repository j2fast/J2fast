// Procedural geometry: everything in the port (terrain, props, characters,
// telegraphs) is generated from primitives with vertex colours, so the
// project needs no imported mesh or texture assets.

#pragma once

#include "CoreMinimal.h"

class UProceduralMeshComponent;
class UMaterialInterface;
class UObject;

struct LANTERNBOUND_API FLBMeshBuilder
{
	TArray<FVector> Verts;
	TArray<int32> Tris;
	TArray<FVector> Normals;
	TArray<FLinearColor> Colors;
	TArray<FVector2D> UVs;

	bool IsEmpty() const { return Tris.Num() == 0; }
	void Reset();

	/** Adds one flat-shaded triangle, emitted on both sides so winding order never hides a face. */
	void Tri(const FVector& A, const FVector& B, const FVector& C, const FLinearColor& Col);
	void Quad(const FVector& A, const FVector& B, const FVector& C, const FVector& D, const FLinearColor& Col);

	/** Axis-aligned box (optionally rotated about Z by YawDeg). Centre/half extents in cm. */
	void Box(const FVector& Center, const FVector& Half, const FLinearColor& Col, float YawDeg = 0.f);
	/** Cylinder or cone along +Z from Base. */
	void Cylinder(const FVector& Base, float RadiusBottom, float RadiusTop, float Height, int32 Segments, const FLinearColor& Col, bool bCaps = true);
	void Sphere(const FVector& Center, const FVector& Radii, int32 Segments, int32 Rings, const FLinearColor& Col);
	/** Flat ring/disc sector on the XY plane (telegraphs). Angles in degrees around +X. */
	void Sector(const FVector& Center, float InnerR, float OuterR, float StartDeg, float SweepDeg, int32 Segments, const FLinearColor& Col);

	/** Generic oriented limb: a tapered cylinder from A to B. */
	void Limb(const FVector& A, const FVector& B, float R0, float R1, int32 Segments, const FLinearColor& Col);

	void Append(const FLBMeshBuilder& Other);
	void Build(UProceduralMeshComponent* Mesh, int32 Section, bool bCollision, UMaterialInterface* Material) const;
};

namespace LBMaterials
{
	/**
	 * Material that displays vertex colours. Uses /Game/Lanternbound/M_VertexColor if the
	 * project has one, otherwise builds one in memory (editor builds), otherwise falls
	 * back to the engine's vertex-colour debug material.
	 */
	LANTERNBOUND_API UMaterialInterface* VertexColor(UObject* Outer);
}
