#include "LBRig.h"
#include "LBMeshKit.h"
#include "LBMath.h"
#include "Components/SceneComponent.h"
#include "ProceduralMeshComponent.h"
#include "GameFramework/Actor.h"

// =================================================================== Poses

FLBPose& FLBPose::Set(ELBJoint Joint, float X, float Y, float Z)
{
	J[int32(Joint)] = FVector(X, Y, Z);
	return *this;
}

FLBPose FLBPose::operator+(const FLBPose& O) const
{
	FLBPose R;
	for (int32 I = 0; I < int32(ELBJoint::Count); I++) R.J[I] = J[I] + O.J[I];
	return R;
}

FLBPose FLBPose::Lerp(const FLBPose& A, const FLBPose& B, float T)
{
	FLBPose R;
	for (int32 I = 0; I < int32(ELBJoint::Count); I++) R.J[I] = A.J[I] + (B.J[I] - A.J[I]) * T;
	return R;
}

using J = ELBJoint;

static TMap<FString, FLBPose> MakePoses()
{
	TMap<FString, FLBPose> P;
	auto Add = [&P](const TCHAR* Name) -> FLBPose& { return P.Add(Name, FLBPose()); };
	Add(TEXT("idle")).Set(J::ArmR, -0.35f, 0, -0.12f).Set(J::ForeR, -0.9f).Set(J::ArmL, 0.05f, 0, 0.18f).Set(J::ForeL, -0.3f);
	Add(TEXT("idleBow")).Set(J::ArmR, 0.05f, 0, -0.15f).Set(J::ForeR, -0.3f).Set(J::ArmL, -0.5f, 0, 0.15f).Set(J::ForeL, -0.6f);
	Add(TEXT("idleTwin")).Set(J::ArmR, -0.4f, 0, -0.2f).Set(J::ForeR, -1.0f).Set(J::ArmL, -0.4f, 0, 0.2f).Set(J::ForeL, -1.0f);
	Add(TEXT("idleHeavy")).Set(J::ArmR, -0.7f, -0.3f, -0.2f).Set(J::ForeR, -1.3f).Set(J::ArmL, -0.6f, 0.4f, 0.2f).Set(J::ForeL, -1.2f).Set(J::Torso, 0.1f);
	Add(TEXT("idleNpc")).Set(J::ArmR, 0.05f, 0, -0.08f).Set(J::ForeR, -0.2f).Set(J::ArmL, 0.05f, 0, 0.08f).Set(J::ForeL, -0.2f);
	Add(TEXT("armsCrossed")).Set(J::ArmR, -0.5f, 0.5f, -0.1f).Set(J::ForeR, -1.7f).Set(J::ArmL, -0.5f, -0.5f, 0.1f).Set(J::ForeL, -1.7f);
	Add(TEXT("slashR_wind")).Set(J::Torso, 0, -0.6f).Set(J::ArmR, -1.45f, -1.5f).Set(J::ForeR, -0.1f).Set(J::ArmL, 0.1f, 0, 0.4f);
	Add(TEXT("slashR_hit")).Set(J::Torso, 0.1f, 0.55f).Set(J::ArmR, -1.45f, 1.3f).Set(J::ArmL, 0.1f, 0, 0.5f);
	Add(TEXT("slashL_wind")).Set(J::Torso, 0, 0.55f).Set(J::ArmR, -1.45f, 1.3f).Set(J::ForeR, -0.1f).Set(J::ArmL, 0.1f, 0, 0.4f);
	Add(TEXT("slashL_hit")).Set(J::Torso, 0.1f, -0.6f).Set(J::ArmR, -1.45f, -1.5f).Set(J::ArmL, 0.1f, 0, 0.5f);
	Add(TEXT("slashUp_wind")).Set(J::Torso, 0.15f, -0.5f).Set(J::ArmR, -0.3f, -0.9f);
	Add(TEXT("slashUp_hit")).Set(J::Torso, -0.15f, 0.5f).Set(J::ArmR, -2.6f, 0.7f);
	Add(TEXT("overhead_wind")).Set(J::Torso, -0.3f).Set(J::ArmR, -2.9f).Set(J::ForeR, -0.4f).Set(J::ArmL, -2.7f).Set(J::ForeL, -0.4f);
	Add(TEXT("overhead_hit")).Set(J::Torso, 0.45f).Set(J::ArmR, -1.0f).Set(J::ArmL, -1.0f);
	Add(TEXT("thrust_wind")).Set(J::Torso, 0, -0.5f).Set(J::ArmR, -1.1f, -0.4f).Set(J::ForeR, -1.4f).Set(J::LegR, 0.3f).Set(J::LegL, -0.3f);
	Add(TEXT("thrust_hit")).Set(J::Torso, 0.25f, 0.15f).Set(J::ArmR, -1.6f).Set(J::LegR, 0.5f).Set(J::LegL, -0.6f).Set(J::ShinR, 0.4f);
	Add(TEXT("spin_wind")).Set(J::Torso, 0.1f, -0.7f).Set(J::ArmR, -1.5f, -1.4f).Set(J::ArmL, -1.2f, 1.2f);
	Add(TEXT("spin_hit")).Set(J::Torso, 0.1f, 0.7f).Set(J::ArmR, -1.5f, -1.5f).Set(J::ArmL, -1.2f, 1.3f);
	Add(TEXT("stabTwin_wind")).Set(J::Torso, -0.1f).Set(J::ArmR, -0.7f, -0.3f).Set(J::ForeR, -1.6f).Set(J::ArmL, -0.7f, 0.3f).Set(J::ForeL, -1.6f);
	Add(TEXT("stabTwin_hit")).Set(J::Torso, 0.3f).Set(J::ArmR, -1.6f, 0.15f).Set(J::ArmL, -1.6f, -0.15f);
	Add(TEXT("shoot_wind")).Set(J::Torso, 0, -0.9f).Set(J::ArmL, -1.55f, 0.9f).Set(J::ArmR, -1.5f, 0.6f).Set(J::ForeR, -2.2f);
	Add(TEXT("shoot_hit")).Set(J::Torso, 0, -0.9f).Set(J::ArmL, -1.55f, 0.9f).Set(J::ArmR, -1.4f, 0.2f).Set(J::ForeR, -0.6f);
	Add(TEXT("chargeShot_wind")).Set(J::Torso, 0.05f, -1.0f).Set(J::ArmL, -1.55f, 1.0f).Set(J::ArmR, -1.5f, 0.8f).Set(J::ForeR, -2.5f);
	Add(TEXT("chargeShot_hit")).Set(J::Torso, 0, -0.9f).Set(J::ArmL, -1.55f, 0.9f).Set(J::ArmR, -1.3f).Set(J::ForeR, -0.4f);
	Add(TEXT("roll")).Set(J::Torso, 0.6f).Set(J::Head, 0.4f).Set(J::ArmR, -1.2f).Set(J::ForeR, -1.8f).Set(J::ArmL, -1.2f).Set(J::ForeL, -1.8f).Set(J::LegR, -1.6f).Set(J::ShinR, 2.2f).Set(J::LegL, -1.6f).Set(J::ShinL, 2.2f);
	Add(TEXT("hit")).Set(J::Torso, -0.35f, 0, 0.1f).Set(J::Head, -0.3f).Set(J::ArmR, -0.6f, 0, -0.5f).Set(J::ArmL, -0.4f, 0, 0.6f);
	Add(TEXT("heal")).Set(J::ArmR, -2.0f, 0.4f).Set(J::ForeR, -1.9f).Set(J::Head, -0.2f);
	Add(TEXT("cast")).Set(J::Torso, -0.2f).Set(J::ArmR, -2.6f, -0.3f).Set(J::ForeR, -0.3f).Set(J::ArmL, -2.6f, 0.3f).Set(J::ForeL, -0.3f);
	Add(TEXT("talk")).Set(J::ArmR, -0.6f, 0.3f, -0.2f).Set(J::ForeR, -0.9f).Set(J::ArmL, 0.05f, 0, 0.1f);
	Add(TEXT("dead")).Set(J::Torso, -0.2f).Set(J::ArmR, -2.8f, 0, -0.6f).Set(J::ArmL, -2.8f, 0, 0.6f).Set(J::LegR, -0.2f).Set(J::LegL, 0.2f);
	Add(TEXT("claw_wind")).Set(J::Torso, -0.2f, -0.4f).Set(J::ArmR, -2.4f, -0.6f).Set(J::ForeR, -0.5f).Set(J::ArmL, -0.8f, 0.4f);
	Add(TEXT("claw_hit")).Set(J::Torso, 0.4f, 0.4f).Set(J::ArmR, -0.9f, 0.6f).Set(J::ArmL, -0.4f);
	Add(TEXT("smash_wind")).Set(J::Torso, -0.35f).Set(J::ArmR, -3.0f).Set(J::ForeR, -0.3f).Set(J::ArmL, -3.0f).Set(J::ForeL, -0.3f);
	Add(TEXT("smash_hit")).Set(J::Torso, 0.55f).Set(J::ArmR, -1.1f).Set(J::ArmL, -1.1f);
	Add(TEXT("crouch")).Set(J::Torso, 0.5f).Set(J::LegR, -1.0f).Set(J::ShinR, 1.6f).Set(J::LegL, -1.0f).Set(J::ShinL, 1.6f).Set(J::ArmR, 0.4f, 0, -0.3f).Set(J::ArmL, 0.4f, 0, 0.3f);
	P.Add(TEXT("cast_wind"), P[TEXT("cast")]);
	P.Add(TEXT("cast_hit"), P[TEXT("cast")]);
	return P;
}

const FLBPose& LBPose(const FString& Name)
{
	static const TMap<FString, FLBPose> Poses = MakePoses();
	static const FLBPose Empty;
	const FLBPose* Found = Poses.Find(Name);
	return Found ? *Found : Empty;
}

FLBPose LBLocomotion(float Phase, float Amount)
{
	const float S = FMath::Sin(Phase);
	const float C = FMath::Cos(Phase);
	const float A = Amount;
	FLBPose P;
	P.Set(J::LegR, S * 0.75f * A).Set(J::LegL, -S * 0.75f * A);
	P.Set(J::ShinR, FMath::Max(0.f, -C) * A + 0.1f * A).Set(J::ShinL, FMath::Max(0.f, C) * A + 0.1f * A);
	P.Set(J::ArmR, -S * 0.4f * A).Set(J::ArmL, S * 0.5f * A);
	P.Set(J::Torso, 0.12f * A, S * 0.12f * A);
	return P;
}

void FLBRig::ApplyPose(const FLBPose& Target, float Dt, float Rate)
{
	const float K = 1.f - FMath::Exp(-Rate * Dt);
	for (int32 I = 0; I < int32(ELBJoint::Count); I++)
	{
		FVector& C = Current.J[I];
		C += (Target.J[I] - C) * K;
		// Axis mapping (web -> Unreal, see LBMath.h): a web x swing is a negative pitch, a web
		// y twist is a negative yaw and a web z rotation is a positive roll. One component per
		// axis keeps three.js's X-then-Y-then-Z composition exact for large angles.
		const float Px = -FMath::RadiansToDegrees(C.X);
		const float Yy = -FMath::RadiansToDegrees(C.Y);
		const float Rz = FMath::RadiansToDegrees(C.Z);
		if (JointX[I] && JointY[I] && Joints[I])
		{
			JointX[I]->SetRelativeRotation(FRotator(Px, 0.f, 0.f));
			JointY[I]->SetRelativeRotation(FRotator(0.f, Yy, 0.f));
			Joints[I]->SetRelativeRotation(FRotator(0.f, 0.f, Rz));
		}
		else if (Joints[I])
		{
			Joints[I]->SetRelativeRotation(FRotator(Px, Yy, Rz));
		}
	}
}

// =================================================================== Building helpers

namespace
{
	FLinearColor H(int32 C) { return LB::Hex(C); }

	/** Web-build local metres (x, y, z) -> Unreal local centimetres. */
	FVector V(float X, float Y, float Z) { return FVector(Z * 100.f, -X * 100.f, Y * 100.f); }

	USceneComponent* MakeJoint(AActor* Owner, USceneComponent* Parent, const FVector& Rel)
	{
		USceneComponent* C = NewObject<USceneComponent>(Owner);
		C->SetupAttachment(Parent);
		C->SetRelativeLocation(Rel);
		C->RegisterComponent();
		return C;
	}

	/** A pose-able joint: x-swing, y-twist and z components nested in that order. Returns the innermost. */
	USceneComponent* MakeChain(AActor* Owner, USceneComponent* Parent, const FVector& Rel, FLBRig& R, ELBJoint Joint)
	{
		USceneComponent* X = MakeJoint(Owner, Parent, Rel);
		USceneComponent* Y = MakeJoint(Owner, X, FVector::ZeroVector);
		USceneComponent* Z = MakeJoint(Owner, Y, FVector::ZeroVector);
		R.JointX[int32(Joint)] = X;
		R.JointY[int32(Joint)] = Y;
		R.Joints[int32(Joint)] = Z;
		return Z;
	}

	UProceduralMeshComponent* MakeMesh(AActor* Owner, USceneComponent* Parent, const FLBMeshBuilder& B, UMaterialInterface* Mat, TArray<UProceduralMeshComponent*>& Out)
	{
		UProceduralMeshComponent* M = NewObject<UProceduralMeshComponent>(Owner);
		M->SetupAttachment(Parent);
		M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		M->SetCastShadow(true);
		M->RegisterComponent();
		B.Build(M, 0, false, Mat);
		Out.Add(M);
		return M;
	}
}

FLBRig LBRigBuilder::Humanoid(AActor* Owner, USceneComponent* Parent, const FLBLook& L, UMaterialInterface* Mat)
{
	FLBRig R;
	R.Kind = ELBRigKind::Humanoid;
	const float B = L.Bulk;
	R.Root = MakeJoint(Owner, Parent, FVector::ZeroVector);
	R.Root->SetRelativeScale3D(FVector(L.Scale));
	R.Spinner = MakeJoint(Owner, R.Root, FVector(0, 0, 55));
	R.Hips = MakeJoint(Owner, R.Spinner, FVector(0, 0, 40));
	R.Height = 185.f * L.Scale;
	USceneComponent* Torso = MakeChain(Owner, R.Hips, FVector::ZeroVector, R, J::Torso);

	FLBMeshBuilder M;
	if (L.bStone) M.Box(FVector(0, 0, 31), FVector(20 * B, 31 * B, 31), L.Cloth);
	else M.Cylinder(FVector::ZeroVector, 21 * B, 27 * B, 62, 10, L.Cloth);
	M.Cylinder(FVector(0, 0, 3.5f), 22.8f * B, 22.8f * B, 9, 10, L.Accent);
	M.Cylinder(FVector(0, 0, 57), 17 * B, 15 * B, 6, 10, L.Cloth2);
	MakeMesh(Owner, Torso, M, Mat, R.Meshes);

	if (L.bSkirt)
	{
		M.Reset();
		M.Cylinder(FVector(0, 0, -50), 36 * B, 22 * B, 55, 12, L.Cloth2, false);
		MakeMesh(Owner, R.Hips, M, Mat, R.Meshes);
	}

	// Head
	USceneComponent* Head = MakeChain(Owner, Torso, FVector(0, 0, 70), R, J::Head);
	M.Reset();
	M.Cylinder(FVector(0, 0, -8), 8, 7, 12, 6, L.Skin);
	if (L.bStone) M.Box(FVector(0, 0, 17), FVector(17, 17, 17), L.Skin);
	else M.Sphere(FVector(0, 0, 17), FVector(19, 19, 19), 12, 8, L.Skin);
	const FLinearColor EyeCol = L.bEyeGlow ? L.Eyes * 3.f : L.Eyes;
	for (const float Side : {-1.f, 1.f})
	{
		M.Sphere(V(Side * 0.07f, 0.19f, 0.17f), FVector(2, 2.8f, L.bEyeGlow ? 1.7f : 3.6f), 6, 4, EyeCol);
	}
	const FString& W = L.Headwear;
	if (W == TEXT("kasa")) M.Cylinder(FVector(0, 0, 23), 46, 0, 20, 14, H(0xc8a46a));
	else if (W == TEXT("horns"))
	{
		M.Sphere(FVector(-1, 0, 24), FVector(20, 20, 12), 10, 6, L.Hair);
		for (const float Side : {-1.f, 1.f}) M.Cylinder(V(Side * 0.11f, 0.26f, 0.02f), 5, 0, 22, 6, H(0xe9dcc0));
	}
	else if (W == TEXT("hood")) M.Sphere(FVector(-5, 0, 22), FVector(21, 24, 19), 12, 7, L.Cloth2);
	else if (W == TEXT("mask"))
	{
		M.Sphere(FVector(-6, 0, 22), FVector(20, 24, 20), 12, 7, L.Cloth2);
		M.Sphere(FVector(9, 0, 17), FVector(12, 19, 22), 12, 7, H(0xf2ede2));
		for (const float Side : {-1.f, 1.f}) M.Box(FVector(21, Side * -7, 20), FVector(1, 3.5f, 0.8f), H(0x120c16));
	}
	else if (W == TEXT("bun"))
	{
		M.Sphere(FVector(-2, 0, 22), FVector(20, 20, 13), 10, 6, L.Hair);
		M.Sphere(FVector(-8, 0, 36), FVector(10, 10, 10), 8, 5, L.Hair);
		M.Limb(FVector(-8, -15, 38), FVector(-8, 15, 38), 1, 1, 4, L.Accent);
	}
	else if (W == TEXT("topknot"))
	{
		M.Sphere(FVector(-1, 0, 22), FVector(20, 20, 12), 10, 6, L.Hair);
		M.Limb(FVector(-3, 0, 32), FVector(-12, 0, 42), 4, 5, 6, L.Hair);
		M.Cylinder(FVector(0, 0, 21), 19.5f, 19.5f, 5, 14, L.Accent, false);
	}
	else if (W == TEXT("hair"))
	{
		M.Sphere(FVector(-2, 0, 22), FVector(20.5f, 20.5f, 14), 10, 6, L.Hair);
		M.Sphere(FVector(-9, 0, 8), FVector(11, 18, 22), 8, 5, L.Hair);
	}
	MakeMesh(Owner, Head, M, Mat, R.Meshes);

	// Arms (+Y is the character's right)
	for (const float Side : {1.f, -1.f})
	{
		const bool bRight = Side > 0;
		USceneComponent* Arm = MakeChain(Owner, Torso, FVector(0, Side * 30 * B, 56), R, bRight ? J::ArmR : J::ArmL);
		M.Reset();
		if (L.bStone) M.Box(FVector(0, 0, -16), FVector(8 * B, 8 * B, 16), L.Cloth);
		else M.Cylinder(FVector(0, 0, -32), 6.5f * B, 7.5f * B, 32, 8, L.Cloth);
		M.Cylinder(FVector(0, 0, -35), 14 * B, 11 * B, 20, 8, L.Cloth2, false);
		MakeMesh(Owner, Arm, M, Mat, R.Meshes);
		USceneComponent* Fore = MakeChain(Owner, Arm, FVector(0, 0, -32), R, bRight ? J::ForeR : J::ForeL);
		M.Reset();
		if (L.bStone) M.Box(FVector(0, 0, -14), FVector(7 * B, 7 * B, 14), L.Skin);
		else M.Cylinder(FVector(0, 0, -28), 5 * B, 6 * B, 28, 8, L.Skin);
		MakeMesh(Owner, Fore, M, Mat, R.Meshes);
		USceneComponent* Hand = MakeJoint(Owner, Fore, FVector(0, 0, -30));
		M.Reset();
		if (L.bStone) M.Box(FVector::ZeroVector, FVector(7, 7, 7), L.Skin);
		else M.Sphere(FVector::ZeroVector, FVector(6.5f * B), 8, 5, L.Skin);
		MakeMesh(Owner, Hand, M, Mat, R.Meshes);
		(bRight ? R.HandR : R.HandL) = Hand;
	}

	// Legs
	for (const float Side : {1.f, -1.f})
	{
		const bool bRight = Side > 0;
		USceneComponent* Leg = MakeChain(Owner, R.Hips, FVector(0, Side * 12 * B, 0), R, bRight ? J::LegR : J::LegL);
		M.Reset();
		if (L.bStone) M.Box(FVector(0, 0, -21), FVector(10 * B, 10 * B, 21), L.Cloth2);
		else M.Cylinder(FVector(0, 0, -42), 8 * B, 9.5f * B, 42, 8, L.Cloth2);
		MakeMesh(Owner, Leg, M, Mat, R.Meshes);
		USceneComponent* Shin = MakeChain(Owner, Leg, FVector(0, 0, -42), R, bRight ? J::ShinR : J::ShinL);
		M.Reset();
		if (L.bStone) M.Box(FVector(0, 0, -21), FVector(9 * B, 9 * B, 21), L.Cloth);
		else M.Cylinder(FVector(0, 0, -42), 6 * B, 7.5f * B, 42, 8, L.Skin);
		M.Box(FVector(4, 0, -44), FVector(11, 6 * B, 3.5f), H(0x2b2430));
		MakeMesh(Owner, Shin, M, Mat, R.Meshes);
	}
	return R;
}

FLBRig LBRigBuilder::Player(AActor* Owner, USceneComponent* Parent, UMaterialInterface* Mat)
{
	FLBLook L;
	L.Skin = H(0xf0c9a0);
	L.Cloth = H(0x2b2f55);
	L.Cloth2 = H(0xe8e0cf);
	L.Accent = H(0xd8452f);
	L.Hair = H(0x1a1622);
	L.Headwear = TEXT("topknot");
	FLBRig R = Humanoid(Owner, Parent, L, Mat);
	// Signature hip lantern and a short haori tail.
	FLBMeshBuilder M;
	M.Cylinder(FVector(-5, -26, -13), 7.5f, 7.5f, 16, 8, H(0xffd58a) * 2.5f);
	M.Cylinder(FVector(-5, -26, 3), 8, 5, 3, 8, H(0x2a1d2e));
	M.Box(FVector(-22, 0, -25), FVector(2, 24, 30), H(0x2b2f55));
	MakeMesh(Owner, R.Hips, M, Mat, R.Meshes);
	return R;
}

UProceduralMeshComponent* LBRigBuilder::Weapon(AActor* Owner, USceneComponent* Hand, const FString& Type, int32 Rarity, UMaterialInterface* Mat, bool bOffhand)
{
	static const int32 Glow[] = {0xdfe6ee, 0xb8f0b0, 0xa8d0ff, 0xd8b0ff, 0xffe08a};
	const FLinearColor Steel = H(Glow[FMath::Clamp(Rarity, 0, 4)]) * (Rarity > 0 ? 1.6f : 1.f);
	const FLinearColor Wood = H(0x5a3a26);
	const FLinearColor Dark = H(0x2a1d2e);
	const FLinearColor Gold = H(0xc9a24a);
	FLBMeshBuilder M;
	if (Type == TEXT("katana"))
	{
		M.Cylinder(FVector(0, 0, -11), 3, 3, 26, 6, Dark);
		M.Cylinder(FVector(0, 0, -13.5f), 7, 7, 2.5f, 10, Gold);
		M.Box(FVector(2, 0, -58), FVector(0.6f, 1.75f, 45), Steel);
	}
	else if (Type == TEXT("naginata"))
	{
		M.Cylinder(FVector(0, 0, -130), 3, 3, 190, 6, Wood);
		M.Box(FVector(3, 0, -160), FVector(0.7f, 3, 31), Steel);
	}
	else if (Type == TEXT("tanto"))
	{
		M.Cylinder(FVector(0, 0, -7), 2.5f, 2.5f, 14, 6, Dark);
		M.Box(FVector(0, 0, -26), FVector(0.5f, 1.75f, 18), Steel);
	}
	else if (Type == TEXT("kanabo"))
	{
		M.Cylinder(FVector(0, 0, -15), 3.5f, 3.5f, 30, 6, H(0x3a2a20));
		M.Cylinder(FVector(0, 0, -109), 10, 5.5f, 95, 8, Rarity > 0 ? H(0x4a3426) * 1.4f : H(0x4a3426));
		for (int32 I = 0; I < 12; I++)
		{
			const float A = I * 1.9f;
			const float Z = -30.f - (I % 6) * 13.f;
			const float Rr = 6.f + (-Z - 14.f) / 95.f * 4.f;
			M.Box(FVector(FMath::Cos(A) * Rr, FMath::Sin(A) * Rr, Z), FVector(1.5f), H(0x9aa0a8));
		}
	}
	else if (Type == TEXT("bow"))
	{
		if (bOffhand)
		{
			FVector Prev;
			for (int32 I = 0; I <= 10; I++)
			{
				const float T = -1.f + 2.f * I / 10.f;
				const FVector P(T * 58.f, 0.f, -(1.f - T * T) * 20.f - 5.f);
				if (I > 0) M.Limb(Prev, P, 2.5f, 2.5f, 5, Rarity > 0 ? H(0x6a3a2a) * 1.5f : H(0x6a3a2a));
				Prev = P;
			}
			M.Limb(FVector(-58, 0, -5), FVector(58, 0, -5), 0.4f, 0.4f, 3, H(0xf0ead8));
		}
		else M.Limb(FVector::ZeroVector, FVector(60, 0, 0), 0.8f, 0.8f, 4, H(0xe8dcc0));
	}
	if (M.IsEmpty()) return nullptr;
	TArray<UProceduralMeshComponent*> Tmp;
	return MakeMesh(Owner, Hand, M, Mat, Tmp);
}

// =================================================================== Creatures

static FLBRig BuildFox(AActor* Owner, USceneComponent* Parent, UMaterialInterface* Mat, FLinearColor Body, FLinearColor Tip, FLinearColor Eyes, int32 Tails, float Scale, bool bRibbon)
{
	FLBRig R;
	R.Kind = ELBRigKind::Fox;
	R.Root = MakeJoint(Owner, Parent, FVector::ZeroVector);
	R.Root->SetRelativeScale3D(FVector(Scale));
	R.Spinner = MakeJoint(Owner, R.Root, FVector::ZeroVector);
	R.Height = 100.f * Scale;
	FLBMeshBuilder M;
	M.Sphere(FVector(0, 0, 55), FVector(45, 25.5f, 24), 12, 8, Body);
	if (bRibbon) M.Cylinder(FVector(30, 0, 62), 15, 15, 6, 10, H(0xd8452f), false);
	MakeMesh(Owner, R.Spinner, M, Mat, R.Meshes);
	USceneComponent* Head = MakeJoint(Owner, R.Spinner, FVector(45, 0, 78));
	R.Joints[int32(J::Head)] = Head;
	M.Reset();
	M.Sphere(FVector::ZeroVector, FVector(20, 20, 18), 10, 6, Body);
	M.Limb(FVector(10, 0, -4), FVector(35, 0, -4), 10, 0, 8, Body);
	M.Sphere(FVector(35, 0, -3), FVector(3), 6, 4, H(0x15101a));
	for (const float Side : {-1.f, 1.f})
	{
		M.Cylinder(FVector(-2, Side * 11, 12), 7, 0, 20, 4, Body);
		M.Sphere(FVector(16, Side * 8, 4), FVector(1.8f, 3.6f, 1.8f), 6, 4, Eyes * 3.f);
	}
	MakeMesh(Owner, Head, M, Mat, R.Meshes);
	for (int32 I = 0; I < 4; I++)
	{
		const float X = I < 2 ? 30.f : -30.f;
		const float Y = (I % 2 == 0) ? -15.f : 15.f;
		USceneComponent* Leg = MakeJoint(Owner, R.Spinner, FVector(X, Y, 50));
		M.Reset();
		M.Cylinder(FVector(0, 0, -50), 4, 5, 50, 6, Body);
		M.Sphere(FVector(0, 0, -50), FVector(5.5f), 6, 4, Tip);
		MakeMesh(Owner, Leg, M, Mat, R.Meshes);
		R.Extra.Add(Leg);
	}
	for (int32 I = 0; I < Tails; I++)
	{
		USceneComponent* Tail = MakeJoint(Owner, R.Spinner, FVector(-40, 0, 62));
		Tail->SetRelativeRotation(FRotator(0, 0, (I - (Tails - 1) / 2.f) * 26.f));
		M.Reset();
		M.Limb(FVector::ZeroVector, FVector(-55, 0, 45), 13, 4, 8, Body);
		M.Sphere(FVector(-60, 0, 49), FVector(8), 6, 4, Tip);
		MakeMesh(Owner, Tail, M, Mat, R.Meshes);
		R.Extra.Add(Tail);
	}
	return R;
}

static FLBRig BuildSpider(AActor* Owner, USceneComponent* Parent, UMaterialInterface* Mat, FLinearColor Body, FLinearColor Mark, float Scale, bool bWidow)
{
	FLBRig R;
	R.Kind = ELBRigKind::Spider;
	R.Root = MakeJoint(Owner, Parent, FVector::ZeroVector);
	R.Root->SetRelativeScale3D(FVector(Scale));
	R.Spinner = MakeJoint(Owner, R.Root, FVector(0, 0, 55));
	R.Height = (bWidow ? 200.f : 90.f) * Scale;
	FLBMeshBuilder M;
	M.Sphere(FVector(-55, 0, 15), FVector(56, 45, 38), 12, 8, Body);
	M.Sphere(FVector(-60, 0, 52), FVector(22, 16, 6), 8, 4, Mark * 2.f);
	M.Sphere(FVector(5, 0, 5), FVector(30), 10, 6, Body);
	for (int32 I = 0; I < 4; I++) M.Sphere(FVector(32, (I - 1.5f) * 7.f, 12.f + (I % 2) * 5.f), FVector(3.5f), 6, 4, H(0xff2a4a) * 3.f);
	if (bWidow)
	{
		const FLinearColor Pale = H(0xd9d0e0);
		M.Cylinder(FVector(20, 0, 20), 22, 16, 60, 10, Pale);
		M.Sphere(FVector(20, 0, 95), FVector(17), 10, 6, H(0xf4f0ea));
		M.Cylinder(FVector(14, 0, 40), 30, 8, 70, 10, H(0x150d1c), false);
		for (const float Side : {-1.f, 1.f}) M.Box(FVector(36, Side * 6, 98), FVector(1, 3, 0.6f), H(0xff2a4a) * 3.f);
	}
	MakeMesh(Owner, R.Spinner, M, Mat, R.Meshes);
	for (int32 I = 0; I < 8; I++)
	{
		const float Side = I < 4 ? -1.f : 1.f;
		const int32 Idx = I % 4;
		USceneComponent* Leg = MakeJoint(Owner, R.Spinner, FVector(25.f - Idx * 17.f, Side * 22.f, 5.f));
		Leg->SetRelativeRotation(FRotator(0, Side * (90.f - (Idx - 1.5f) * 25.f), 0));
		M.Reset();
		M.Limb(FVector::ZeroVector, FVector(55, 0, 40), 4, 3.5f, 5, Body * 0.7f);
		M.Limb(FVector(55, 0, 40), FVector(90, 0, -55), 3.5f, 1.5f, 5, Body * 0.7f);
		MakeMesh(Owner, Leg, M, Mat, R.Meshes);
		R.Extra.Add(Leg);
	}
	if (bWidow)
	{
		for (const float Side : {-1.f, 1.f})
		{
			USceneComponent* Arm = MakeJoint(Owner, R.Spinner, FVector(20, Side * 20, 75));
			M.Reset();
			M.Limb(FVector::ZeroVector, FVector(0, 0, -60), 4, 3, 6, H(0xd9d0e0));
			MakeMesh(Owner, Arm, M, Mat, R.Meshes);
			R.Joints[int32(Side > 0 ? J::ArmR : J::ArmL)] = Arm;
		}
	}
	return R;
}

static FLBRig BuildWisp(AActor* Owner, USceneComponent* Parent, UMaterialInterface* Mat)
{
	FLBRig R;
	R.Kind = ELBRigKind::Wisp;
	R.Root = MakeJoint(Owner, Parent, FVector::ZeroVector);
	R.Spinner = MakeJoint(Owner, R.Root, FVector(0, 0, 150));
	R.Height = 190.f;
	FLBMeshBuilder M;
	M.Sphere(FVector::ZeroVector, FVector(32), 12, 8, H(0xffb050) * 3.f);
	M.Cylinder(FVector(0, 0, 15), 28, 0, 80, 10, H(0xff8a2a) * 2.f, false);
	for (const float Side : {-1.f, 1.f}) M.Sphere(FVector(28, Side * 10, 5), FVector(2.5f, 4, 7), 6, 4, H(0x2a0a00));
	MakeMesh(Owner, R.Spinner, M, Mat, R.Meshes);
	return R;
}

static FLBRig BuildMask(AActor* Owner, USceneComponent* Parent, UMaterialInterface* Mat)
{
	FLBRig R;
	R.Kind = ELBRigKind::Mask;
	R.Root = MakeJoint(Owner, Parent, FVector::ZeroVector);
	R.Root->SetRelativeScale3D(FVector(1.6f));
	R.Spinner = MakeJoint(Owner, R.Root, FVector(0, 0, 160));
	R.Height = 320.f * 1.6f;
	FLBMeshBuilder M;
	M.Cylinder(FVector(0, 0, -150), 90, 20, 240, 14, H(0x241a36), false);
	M.Cylinder(FVector(0, 0, 4), 45, 45, 12, 16, H(0xb03a3a), false);
	M.Sphere(FVector(-6, 0, 130), FVector(58, 62, 55), 12, 8, H(0x241a36));
	M.Sphere(FVector(22, 0, 125), FVector(28, 55, 68), 14, 9, H(0xf4efe4));
	for (const float Side : {-1.f, 1.f})
	{
		M.Box(FVector(49, Side * 20, 138), FVector(1.5f, 9, 3.5f), H(0x1a1020));
		M.Box(FVector(47, Side * 22, 158), FVector(1.5f, 10, 1.5f), H(0xb02a2a));
	}
	M.Box(FVector(48, 0, 92), FVector(1.5f, 12, 2.5f), H(0xb02a2a));
	M.Sphere(FVector(0, 0, 30), FVector(140, 140, 140), 12, 8, H(0x6a2ab0) * 0.25f);
	MakeMesh(Owner, R.Spinner, M, Mat, R.Meshes);
	for (const float Side : {-1.f, 1.f})
	{
		USceneComponent* Hand = MakeJoint(Owner, R.Spinner, FVector(40, Side * 140, 40));
		M.Reset();
		M.Sphere(FVector::ZeroVector, FVector(26, 22, 13), 10, 6, H(0xe8e0f0) * 1.3f);
		for (int32 F = 0; F < 4; F++) M.Limb(FVector(10, (F - 1.5f) * 9.f, 0), FVector(42, (F - 1.5f) * 9.f, 0), 5, 0.5f, 5, H(0xe8e0f0) * 1.3f);
		MakeMesh(Owner, Hand, M, Mat, R.Meshes);
		R.Extra.Add(Hand);
	}
	return R;
}

static FLBRig BuildDummy(AActor* Owner, USceneComponent* Parent, UMaterialInterface* Mat)
{
	FLBRig R;
	R.Kind = ELBRigKind::Dummy;
	R.Root = MakeJoint(Owner, Parent, FVector::ZeroVector);
	R.Spinner = MakeJoint(Owner, R.Root, FVector::ZeroVector);
	R.Height = 190.f;
	FLBMeshBuilder M;
	M.Cylinder(FVector::ZeroVector, 7, 6, 170, 6, H(0x5a3a26));
	M.Cylinder(FVector(0, 0, 70), 32, 28, 80, 10, H(0xd8bf72));
	M.Limb(FVector(0, -60, 135), FVector(0, 60, 135), 4, 4, 6, H(0x5a3a26));
	M.Sphere(FVector(0, 0, 172), FVector(20), 10, 6, H(0xe8dcb8));
	M.Cylinder(FVector(0, 0, 176), 20.5f, 20.5f, 5, 12, H(0xd8452f), false);
	MakeMesh(Owner, R.Spinner, M, Mat, R.Meshes);
	return R;
}

FLBRig LBRigBuilder::ForModel(AActor* Owner, USceneComponent* Parent, const FString& Model, UMaterialInterface* Mat)
{
	FLBLook L;
	auto Look = [&L](int32 Skin, int32 Cloth, int32 Cloth2, int32 Accent, int32 Hair, const TCHAR* Headwear, float Scale = 1.f, float Bulk = 1.f) {
		L.Skin = H(Skin);
		L.Cloth = H(Cloth);
		L.Cloth2 = H(Cloth2);
		L.Accent = H(Accent);
		L.Hair = H(Hair);
		L.Headwear = Headwear;
		L.Scale = Scale;
		L.Bulk = Bulk;
	};
	auto Glow = [&L](int32 Eyes) {
		L.Eyes = H(Eyes);
		L.bEyeGlow = true;
	};

	if (Model == TEXT("dummy")) return BuildDummy(Owner, Parent, Mat);
	if (Model == TEXT("wisp")) return BuildWisp(Owner, Parent, Mat);
	if (Model == TEXT("yomikage")) return BuildMask(Owner, Parent, Mat);
	if (Model == TEXT("fox")) return BuildFox(Owner, Parent, Mat, H(0x2a2236), H(0x6a3a8a), H(0xff4ad8), 1, 1.05f, false);
	if (Model == TEXT("kohaku")) return BuildFox(Owner, Parent, Mat, H(0xf4f0ea), H(0xf0b040), H(0xffa020), 3, 0.85f, true);
	if (Model == TEXT("spiderling")) return BuildSpider(Owner, Parent, Mat, H(0x3a2a4a), H(0xc04aff), 0.55f, false);
	if (Model == TEXT("widow")) return BuildSpider(Owner, Parent, Mat, H(0x2a1d33), H(0xff2a4a), 1.9f, true);

	if (Model == TEXT("imp")) { Look(0x6d6670, 0x3a3138, 0x2a2228, 0xb85a2a, 0x2a2228, TEXT("horns"), 0.85f, 1.1f); Glow(0xff7a2a); }
	else if (Model == TEXT("lurker")) { Look(0x5b7a4a, 0x3f5a35, 0x2e4228, 0x6b5a3a, 0x2e4228, TEXT(""), 1.1f, 1.35f); Glow(0xf0e04a); }
	else if (Model == TEXT("sentinel")) { Look(0x8a8f96, 0x6f747c, 0x5a5f66, 0x4a7a4a, 0x5a5f66, TEXT(""), 1.35f, 1.4f); Glow(0x6fe8ff); L.bStone = true; }
	else if (Model == TEXT("acolyte")) { Look(0x9a8aa8, 0x2a1f3a, 0x4b2f5c, 0xb03a3a, 0x15101a, TEXT("mask")); L.bSkirt = true; }
	else if (Model == TEXT("oni")) { Look(0xa8322a, 0x2a2a2a, 0xd9a54a, 0x1a1a1a, 0xe8e2d0, TEXT("horns"), 2.1f, 1.5f); Glow(0xffe04a); }
	else if (Model == TEXT("tsugumi")) { Look(0xe8c4a0, 0x6b4c7a, 0xd9cfbf, 0xc9a24a, 0xd4d0cc, TEXT("bun"), 0.92f); L.bSkirt = true; }
	else if (Model == TEXT("kanetsugu")) Look(0xd9a77a, 0x4a3a2e, 0x8a6a4a, 0xb04030, 0x1a1622, TEXT("topknot"), 1.05f, 1.3f);
	else if (Model == TEXT("ohana")) { Look(0xf2d0b0, 0x3f7a6a, 0xf2d7b6, 0xf0a0b0, 0x2a1a1a, TEXT("bun"), 0.95f); L.bSkirt = true; }
	else if (Model == TEXT("mikoto")) { Look(0xf2d6be, 0xf4f0ea, 0xc8322b, 0xffffff, 0x15121a, TEXT("hair")); L.bSkirt = true; }
	else if (Model == TEXT("ibuki")) Look(0xc99a78, 0x5a6470, 0x3a4048, 0x8a8a6a, 0x8a8a8a, TEXT("kasa"));
	else if (Model == TEXT("hotaru")) { Look(0xdff4ff, 0x9fd8ff, 0xe8f8ff, 0xffe08a, 0x6aa0d0, TEXT("bun"), 0.6f); L.bSkirt = true; }
	else if (Model == TEXT("farmer")) Look(0xd9a77a, 0x6a7a4a, 0xd9cfbf, 0x8a6a3a, 0x2a1a1a, TEXT("kasa"), 1.f, 1.1f);
	else if (Model == TEXT("child")) Look(0xf2d0b0, 0xc8503a, 0xf2e8d2, 0x3a6aa8, 0x1a1622, TEXT("topknot"), 0.65f);
	else if (Model == TEXT("fisher")) Look(0xc99a78, 0x3a5a7a, 0xc8c0b0, 0x6a6a5a, 0xb8b8b8, TEXT("hair"), 0.95f);
	else Look(0xe8c4a0, 0x7a6a5a, 0xd9cfbf, 0x8a4a3a, 0x2a1a1a, TEXT("hair"));

	FLBRig R = LBRigBuilder::Humanoid(Owner, Parent, L, Mat);
	if (Model == TEXT("imp")) { R.BasePose = TEXT("idleTwin"); R.Hunch = 0.35f; }
	else if (Model == TEXT("lurker")) { R.BasePose = TEXT("idleTwin"); R.Hunch = 0.55f; }
	else if (Model == TEXT("sentinel") || Model == TEXT("oni")) R.BasePose = TEXT("idleHeavy");
	else if (Model == TEXT("acolyte")) R.BasePose = TEXT("idleNpc");
	else if (Model == TEXT("kanetsugu")) R.BasePose = TEXT("armsCrossed");
	else if (Model == TEXT("ibuki") || Model == TEXT("fisher") || Model == TEXT("tsugumi")) R.BasePose = TEXT("idleBow");
	// Accessories
	FLBMeshBuilder M;
	if (Model == TEXT("imp"))
	{
		for (USceneComponent* Hand : {R.HandR, R.HandL})
		{
			M.Reset();
			for (int32 I = 0; I < 3; I++) M.Cylinder(FVector(2, (I - 1) * 4.f, -2), 2, 0, -14, 4, H(0xe9dcc0));
			MakeMesh(Owner, Hand, M, Mat, R.Meshes);
		}
	}
	else if (Model == TEXT("lurker"))
	{
		M.Sphere(FVector(-20, 0, 35), FVector(25, 40, 42), 10, 6, H(0x6b5a3a));
		MakeMesh(Owner, R.Joints[int32(J::Torso)], M, Mat, R.Meshes);
	}
	else if (Model == TEXT("sentinel"))
	{
		M.Cylinder(FVector(0, 0, -90), 5, 5, 100, 6, H(0x5a5f66));
		M.Box(FVector(0, 0, -95), FVector(30, 17.5f, 17.5f), H(0x7a7f86));
		M.Box(FVector(0, 0, -95), FVector(15, 18, 4), H(0x6fe8ff) * 3.f);
		MakeMesh(Owner, R.HandR, M, Mat, R.Meshes);
	}
	else if (Model == TEXT("acolyte"))
	{
		for (USceneComponent* Hand : {R.HandR, R.HandL})
		{
			M.Reset();
			M.Sphere(FVector(0, 0, -12), FVector(9), 8, 5, H(0xc07aff) * 3.f);
			MakeMesh(Owner, Hand, M, Mat, R.Meshes);
		}
	}
	else if (Model == TEXT("oni"))
	{
		LBRigBuilder::Weapon(Owner, R.HandR, TEXT("kanabo"), 0, Mat, false)->SetRelativeScale3D(FVector(1.6f));
	}
	else if (Model == TEXT("tsugumi"))
	{
		M.Cylinder(FVector(0, 0, -105), 2.5f, 3, 160, 6, H(0x5a3a26));
		M.Sphere(FVector(0, 0, 60), FVector(8), 8, 5, H(0xffd58a) * 2.5f);
		MakeMesh(Owner, R.HandR, M, Mat, R.Meshes);
	}
	else if (Model == TEXT("ibuki") || Model == TEXT("fisher"))
	{
		M.Cylinder(FVector(0, 0, -160), 3, 3, 260, 6, H(0x5a3a26));
		MakeMesh(Owner, R.HandR, M, Mat, R.Meshes);
	}
	return R;
}

// =================================================================== Animation

void FLBRig::Animate(const FString& Mode, const FString& AttackPose, float Time, float Speed, float Progress, float Dt)
{
	if (!Root) return;
	Phase += Dt * (2.f + Speed * 2.4f);
	if (FlashTime > 0.f)
	{
		FlashTime -= Dt;
		const float S = FlashTime > 0.f ? 1.06f : 1.f;
		if (Spinner) Spinner->SetRelativeScale3D(FVector(S));
	}
	const bool bDead = Mode == TEXT("dead");
	switch (Kind)
	{
	case ELBRigKind::Humanoid:
	{
		FLBPose Pose = LBPose(BasePose);
		if (Mode == TEXT("move")) Pose = Pose + LBLocomotion(Phase, FMath::Min(1.f, Speed / 3.f));
		else if (Mode == TEXT("windup") && !AttackPose.IsEmpty()) Pose = LBPose(AttackPose + TEXT("_wind"));
		else if ((Mode == TEXT("active") || Mode == TEXT("recover")) && !AttackPose.IsEmpty()) Pose = LBPose(AttackPose + TEXT("_hit"));
		else if (Mode == TEXT("hit") || Mode == TEXT("stagger")) Pose = LBPose(TEXT("hit"));
		else if (bDead) Pose = LBPose(TEXT("dead"));
		else if (Mode == TEXT("talk")) Pose = LBPose(TEXT("talk"));
		if (Hunch != 0.f)
		{
			FLBPose HunchPose;
			HunchPose.Set(J::Torso, Hunch);
			Pose = Pose + HunchPose;
		}
		if (Mode == TEXT("idle"))
		{
			FLBPose Breath;
			Breath.Set(J::Torso, FMath::Sin(Time * 1.6f) * 0.03f).Set(J::Head, FMath::Sin(Time * 0.7f) * 0.05f, FMath::Sin(Time * 0.4f) * 0.15f);
			Pose = Pose + Breath;
		}
		const float Rate = Mode == TEXT("active") ? 30.f : Mode == TEXT("windup") ? 10.f : 14.f;
		ApplyPose(Pose, Dt, Rate);
		if (Spinner)
		{
			const float Tilt = bDead ? 90.f : 0.f;
			FRotator Rot = Spinner->GetRelativeRotation();
			Rot.Pitch += (Tilt - Rot.Pitch) * FMath::Min(1.f, Dt * 6.f);
			Spinner->SetRelativeRotation(Rot);
			Spinner->SetRelativeLocation(FVector(0, 0, 55.f - (bDead ? 35.f * FMath::Min(1.f, Progress * 3.f) : 0.f)));
		}
		if (Hips) Hips->SetRelativeLocation(FVector(0, 0, 40.f + (Mode == TEXT("move") ? FMath::Abs(FMath::Sin(Phase)) * 5.f : 0.f)));
		break;
	}
	case ELBRigKind::Fox:
	{
		const float Moving = Mode == TEXT("move") ? FMath::Min(1.f, Speed / 3.f) : 0.f;
		for (int32 I = 0; I < Extra.Num(); I++)
		{
			if (I < 4)
			{
				const float Sign = (I == 0 || I == 3) ? 1.f : -1.f;
				Extra[I]->SetRelativeRotation(FRotator(FMath::Sin(Phase * 2.f) * 45.f * Moving * Sign, 0, 0));
			}
			else
			{
				FRotator R = Extra[I]->GetRelativeRotation();
				R.Yaw = FMath::Sin(Time * 3.f + I) * 20.f;
				Extra[I]->SetRelativeRotation(R);
			}
		}
		const float Crouch = Mode == TEXT("windup") ? 1.f : 0.f;
		const float Stretch = Mode == TEXT("active") ? 1.f : 0.f;
		if (Spinner)
		{
			Spinner->SetRelativeLocation(FVector(0, 0, -18.f * Crouch + (Moving > 0 ? FMath::Abs(FMath::Sin(Phase * 2.f)) * 6.f : 0.f)));
			Spinner->SetRelativeRotation(FRotator(-Crouch * 8.f + Stretch * 14.f, 0, bDead ? 90.f : 0.f));
		}
		break;
	}
	case ELBRigKind::Spider:
	{
		const float Moving = Mode == TEXT("move") ? 1.f : 0.15f;
		for (int32 I = 0; I < Extra.Num(); I++)
		{
			const float P = Phase * 2.f + (I % 4) * 1.6f + (I < 4 ? 0.f : UE_PI);
			FRotator R = Extra[I]->GetRelativeRotation();
			R.Pitch = FMath::Sin(P) * 14.f * Moving;
			if (Mode == TEXT("windup") && I % 4 == 0) R.Pitch = 35.f;
			Extra[I]->SetRelativeRotation(R);
		}
		for (const J Arm : {J::ArmR, J::ArmL})
		{
			if (USceneComponent* A = Joints[int32(Arm)]) A->SetRelativeRotation(FRotator(Mode == TEXT("windup") ? 140.f : Mode == TEXT("active") ? 35.f : 10.f, 0, 0));
		}
		if (Spinner)
		{
			const float Rear = Mode == TEXT("windup") ? 20.f : Mode == TEXT("active") ? -8.f : 0.f;
			Spinner->SetRelativeRotation(FRotator(Rear, 0, bDead ? 180.f : 0.f));
		}
		break;
	}
	case ELBRigKind::Wisp:
		if (Spinner)
		{
			const float Swell = Mode == TEXT("windup") ? 1.f + Progress * 0.4f : 1.f;
			Spinner->SetRelativeLocation(FVector(0, 0, 150.f + FMath::Sin(Time * 3.f) * 12.f));
			Spinner->SetRelativeScale3D(FVector(bDead ? FMath::Max(0.01f, 1.f - Progress * 2.f) : Swell));
		}
		break;
	case ELBRigKind::Mask:
	{
		if (Spinner) Spinner->SetRelativeLocation(FVector(0, 0, 160.f + FMath::Sin(Time * 1.5f) * 15.f + (bDead ? Progress * 200.f : 0.f)));
		const float Raise = Mode == TEXT("windup") ? 1.f : 0.f;
		const float Strike = Mode == TEXT("active") ? 1.f : 0.f;
		for (int32 I = 0; I < Extra.Num(); I++)
		{
			const float Side = I == 0 ? -1.f : 1.f;
			const FVector Target(40.f + Strike * 140.f, Side * (140.f - Strike * 50.f), 40.f + Raise * 120.f - Strike * 50.f + FMath::Sin(Time * 2.f + I) * 10.f);
			Extra[I]->SetRelativeLocation(FMath::VInterpTo(Extra[I]->GetRelativeLocation(), Target, Dt, 10.f));
		}
		break;
	}
	case ELBRigKind::Dummy:
		if (Spinner)
		{
			if (Mode == TEXT("hit") || Mode == TEXT("stagger")) Wobble = 0.4f;
			Wobble *= FMath::Exp(-Dt * 4.f);
			const float Fall = bDead ? -90.f : 0.f;
			Spinner->SetRelativeRotation(FRotator(FMath::RadiansToDegrees(FMath::Sin(Time * 18.f) * Wobble) + Fall, 0, 0));
		}
		break;
	}
}
