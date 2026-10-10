// Procedural character rigs (humanoids and creatures) assembled from
// ProceduralMeshComponents on joint SceneComponents, with pose blending.
// Poses use the web build's values (radians, Three.js axes) and are converted.

#pragma once

#include "CoreMinimal.h"

class AActor;
class USceneComponent;
class UProceduralMeshComponent;
class UMaterialInterface;

enum class ELBJoint : uint8 { Torso, Head, ArmR, ForeR, ArmL, ForeL, LegR, ShinR, LegL, ShinL, Count };

struct FLBPose
{
	FRotator J[int32(ELBJoint::Count)];
	FLBPose() { for (FRotator& R : J) R = FRotator::ZeroRotator; }
	/** Set a joint from web-build radians (x, y, z), converted to Unreal degrees. */
	FLBPose& Set(ELBJoint Joint, float X, float Y = 0.f, float Z = 0.f);
	FLBPose operator+(const FLBPose& O) const;
	static FLBPose Lerp(const FLBPose& A, const FLBPose& B, float T);
};

/** Named poses (same names as the web build: idle, slashR_wind, roll, ...). */
const FLBPose& LBPose(const FString& Name);
FLBPose LBLocomotion(float Phase, float Amount);

struct FLBLook
{
	FLinearColor Skin = FLinearColor::White;
	FLinearColor Cloth = FLinearColor::Gray;
	FLinearColor Cloth2 = FLinearColor::Gray;
	FLinearColor Accent = FLinearColor::Yellow;
	FLinearColor Hair = FLinearColor::Black;
	FLinearColor Eyes = FLinearColor::Black;
	FString Headwear; // kasa horns hood mask bun hair topknot
	float Scale = 1.f;
	float Bulk = 1.f;
	bool bSkirt = false;
	bool bEyeGlow = false;
	bool bStone = false;
};

enum class ELBRigKind : uint8 { Humanoid, Fox, Spider, Wisp, Mask, Dummy };

struct LANTERNBOUND_API FLBRig
{
	ELBRigKind Kind = ELBRigKind::Humanoid;
	USceneComponent* Root = nullptr;
	USceneComponent* Spinner = nullptr;
	USceneComponent* Hips = nullptr;
	USceneComponent* Joints[int32(ELBJoint::Count)] = {};
	USceneComponent* HandR = nullptr;
	USceneComponent* HandL = nullptr;
	/** Creature extra parts (legs, tails, hands) animated procedurally. */
	TArray<USceneComponent*> Extra;
	TArray<UProceduralMeshComponent*> Meshes;
	FLBPose Current;
	float Height = 185.f;
	float Phase = 0.f;
	float FlashTime = 0.f;
	/** Rest pose used by Animate (humanoids). */
	FString BasePose = TEXT("idleNpc");
	/** Extra forward lean of the torso, web-build radians (creature-like humanoids). */
	float Hunch = 0.f;
	/** Training-dummy wobble amount. */
	float Wobble = 0.f;

	bool IsValid() const { return Root != nullptr; }
	void ApplyPose(const FLBPose& Target, float Dt, float Rate);
	/** Visual hit flash: briefly scales the body. */
	void Flash() { FlashTime = 0.12f; }
	/** Generic per-frame animation for non-player characters. Mode: idle move windup active recover hit stagger dead. */
	void Animate(const FString& Mode, const FString& AttackPose, float Time, float Speed, float Progress, float Dt);
};

namespace LBRigBuilder
{
	LANTERNBOUND_API FLBRig Humanoid(AActor* Owner, USceneComponent* Parent, const FLBLook& Look, UMaterialInterface* Mat);
	/** Builds the model for an enemy model id or NPC id. */
	LANTERNBOUND_API FLBRig ForModel(AActor* Owner, USceneComponent* Parent, const FString& Model, UMaterialInterface* Mat);
	LANTERNBOUND_API FLBRig Player(AActor* Owner, USceneComponent* Parent, UMaterialInterface* Mat);
	/** Weapon mesh in hand (blade along -Z). Returns the created component. */
	LANTERNBOUND_API UProceduralMeshComponent* Weapon(AActor* Owner, USceneComponent* Hand, const FString& WeaponType, int32 Rarity, UMaterialInterface* Mat, bool bOffhand);
}
