// Visual effects (port of src/render/effects.ts): particle bursts, ambient
// particles, ground telegraphs for enemy attacks, shockwave rings, weapon
// trails and floating damage numbers (drawn by the HUD). Everything is built
// from procedural meshes with vertex colours.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "LBTypes.h"
#include "LBFx.generated.h"

class UProceduralMeshComponent;

struct FLBBurst
{
	int32 Count = 10;
	int32 Color = 0xffffff;
	float Speed = 3.f;
	float Life = 0.6f;
	float Gravity = 0.f;
	float UpBias = -1.f; // < 0: default
	int32 Size = 0;      // 0 small sparks, 1 medium embers, 2 large smoke
	float Spread = 0.1f;
	float Drag = 2.f;
};

enum class ELBTeleShape : uint8 { Circle, Cone, Line, Ring };

struct FLBFloatText
{
	FVector Pos; // world cm
	FString Text;
	FLinearColor Color;
	float Scale = 1.f;
	float T = 0.f;
	float Life = 0.9f;
	float Vy = 160.f;
	bool bDamage = false;
};

UCLASS()
class LANTERNBOUND_API ALBFx : public AActor
{
	GENERATED_BODY()

public:
	ALBFx();

	bool bReduceFlashing = false;
	bool bHighContrast = false;
	bool bDamageNumbers = true;

	// Positions are game coordinates (metres, y up) like the web build.
	void Burst(float X, float Y, float Z, const FLBBurst& B);
	void HitSpark(float X, float Y, float Z, bool bCrit, int32 Color = 0xffd27a);
	void DeathPuff(float X, float Y, float Z, int32 Color);
	void Shockwave(float X, float Y, float Z, float Radius, int32 Color = 0xffc070, float Life = 0.45f);
	void SetAmbient(const FLBAmbientDef* Def);

	/** Returns a handle used to move or cancel the telegraph. Yaw is game radians. */
	int32 Telegraph(ELBTeleShape Shape, float A, float B, float X, float Y, float Z, float Yaw, float Duration);
	void MoveTelegraph(int32 Handle, float X, float Y, float Z, float Yaw);
	void RemoveTelegraph(int32 Handle);
	int32 TelegraphCount() const { return Teles.Num(); }

	/** Weapon trail: push the blade base and tip (world cm) each frame while active. */
	void TrailPush(const FVector& Base, const FVector& Tip);
	void SetTrailColor(int32 Color) { TrailColor = Color; }
	bool bTrailActive = false;

	void FloatText(float X, float Y, float Z, const FString& Text, const FLinearColor& Color, float Life = 0.9f, float Scale = 1.f, bool bDamage = true);
	TArray<FLBFloatText> Floats;

	/** Advances everything; CameraRot orients particle quads. Focus is the player (game metres). */
	void Step(float Dt, const FRotator& CameraRot, const FVector& Focus);
	void ClearTransient();

private:
	struct FParticle
	{
		FVector P, V; // game metres
		float Life = 0.f, MaxLife = 1.f, Gravity = 0.f, Drag = 1.f;
		FLinearColor C;
	};
	struct FPool
	{
		TArray<FParticle> Parts;
		int32 Capacity = 0;
		float Size = 0.2f;
		UProceduralMeshComponent* Mesh = nullptr;
	};
	struct FTele
	{
		int32 Handle = 0;
		ELBTeleShape Shape = ELBTeleShape::Circle;
		float A = 1.f, B = 0.f;
		float Duration = 1.f, T = 0.f;
		USceneComponent* Pivot = nullptr;
		UProceduralMeshComponent* Fill = nullptr;
		UProceduralMeshComponent* Edge = nullptr;
	};
	struct FWave
	{
		FVector P;
		float T = 0.f, Life = 0.45f, To = 3.f;
		int32 Color = 0xffc070;
		UProceduralMeshComponent* Mesh = nullptr;
	};

	FPool Sparks, Embers, Smoke, Ambient;
	bool bHasAmbient = false;
	FLBAmbientDef AmbientDef;
	float AmbientTimer = 0.f;
	TArray<FTele> Teles;
	int32 NextHandle = 1;
	TArray<FWave> Waves;
	TArray<FVector> TrailSamples;
	float TrailFade = 0.f;
	int32 TrailColor = 0xbfe6ff;
	UProceduralMeshComponent* TrailMesh = nullptr;
	FRandomStream Rng;

	void InitPool(FPool& Pool, int32 Capacity, float Size, bool bAdditive);
	void Spawn(FPool& Pool, const FVector& P, const FVector& V, float Life, const FLinearColor& C, float Gravity, float Drag);
	void UpdatePool(FPool& Pool, float Dt, const FVector& Right, const FVector& Up, bool bPetals);
	UProceduralMeshComponent* NewMesh();
};
