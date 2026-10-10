// Coordinate and colour helpers.
//
// Game data uses the web build's convention: metres, Y up, ground plane (x, z),
// yaw 0 facing +z. Unreal uses centimetres, Z up, X forward, Y right
// (left-handed). The mapping X = z, Y = -x preserves the layout's chirality
// (it is not a mirror image), and a game yaw of `a` radians becomes an Unreal
// yaw of -a in degrees.

#pragma once

#include "CoreMinimal.h"

namespace LB
{
	constexpr float M = 100.f; // centimetres per metre

	inline FVector ToWorld(float X, float Z, float Height)
	{
		return FVector(Z * M, -X * M, Height * M);
	}

	/** World location -> game (x, z) in metres. */
	inline FVector2D ToGame(const FVector& W)
	{
		return FVector2D(-W.Y / M, W.X / M);
	}

	inline float YawToUE(float GameYawRadians)
	{
		return -FMath::RadiansToDegrees(GameYawRadians);
	}

	inline FLinearColor Hex(int32 C)
	{
		return FLinearColor(FColor((C >> 16) & 255, (C >> 8) & 255, C & 255, 255));
	}

	/** Planar distance in metres between two world locations. */
	inline float Dist2D(const FVector& A, const FVector& B)
	{
		return FVector::Dist2D(A, B) / M;
	}

	/** Unreal yaw (degrees) that faces from A toward B. */
	inline float YawTowards(const FVector& A, const FVector& B)
	{
		return FMath::RadiansToDegrees(FMath::Atan2(B.Y - A.Y, B.X - A.X));
	}

	inline float AngleDiffDeg(float From, float To)
	{
		return FMath::FindDeltaAngleDegrees(From, To);
	}
}
