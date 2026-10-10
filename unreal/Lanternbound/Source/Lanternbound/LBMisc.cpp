// Projectiles, hazards, pickups, NPCs and the companion (ports of
// src/entities/projectiles.ts, hazards.ts, pickups.ts, npc.ts, companion.ts).

#include "LBEntities.h"
#include "LBGame.h"
#include "LBArea.h"
#include "LBFx.h"
#include "LBData.h"
#include "LBMath.h"
#include "LBMeshKit.h"
#include "LBVisual.h"
#include "ProceduralMeshComponent.h"

using namespace LBMathG;

namespace
{
	UProceduralMeshComponent* AddMesh(ALBVisual* Actor, const FLBMeshBuilder& M, ELBMat Kind, int32 Section = 0, UProceduralMeshComponent* Existing = nullptr)
	{
		if (!Actor) return nullptr;
		UProceduralMeshComponent* C = Existing;
		if (!C)
		{
			C = NewObject<UProceduralMeshComponent>(Actor);
			C->SetupAttachment(Actor->GetRootComponent());
			C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			C->SetCastShadow(false);
			C->RegisterComponent();
		}
		M.Build(C, Section, false, LBMaterials::Get(Kind));
		return C;
	}

	FLinearColor Half(int32 Hex, float Alpha = 1.f)
	{
		FLinearColor C = LB::Hex(Hex) * 0.5f;
		C.A = Alpha;
		return C;
	}

	void DestroyActor(ALBVisual*& A)
	{
		LBSafeDestroy(A);
		A = nullptr;
	}

	FLinearColor RarityHex(int32 Rarity)
	{
		static const int32 Colors[] = {0xdcd6cc, 0x7fd17a, 0x6ab0ff, 0xc08aff, 0xffb347};
		return LB::Hex(Colors[FMath::Clamp(Rarity, 0, 4)]);
	}
}

// =================================================================== Projectiles

void FLBProjectiles::SpawnArrow(const FVector& Pos, const FVector& Dir, float Speed, float Radius, bool bPierce, const FLBHitInfo& Info)
{
	FProj P;
	P.Actor = G.SpawnVisual();
	if (P.Actor)
	{
		FLBMeshBuilder Shaft;
		Shaft.Limb(FVector(-45.f, 0, 0), FVector(45.f, 0, 0), 3.f, 3.f, 5, Half(0xfff0c0));
		FLBMeshBuilder Tip;
		Tip.Limb(FVector(45.f, 0, 0), FVector(75.f, 0, 0), 9.f, 0.f, 6, Half(bPierce ? 0x9ad8ff : 0xffd27a));
		FLBMeshBuilder Glow;
		const float GS = bPierce ? 50.f : 28.f;
		Glow.Sphere(FVector(40.f, 0, 0), FVector(GS), 10, 8, Half(bPierce ? 0x6ab8ff : 0xffb050, 0.35f));
		UProceduralMeshComponent* M = AddMesh(P.Actor, Shaft, ELBMat::Unlit);
		AddMesh(P.Actor, Tip, ELBMat::Unlit, 1, M);
		AddMesh(P.Actor, Glow, ELBMat::Additive);
		const FVector DirUE = FVector(Dir.Z, -Dir.X, Dir.Y).GetSafeNormal();
		P.Actor->SetActorLocationAndRotation(LB::ToWorld(Pos.X, Pos.Z, Pos.Y), FRotationMatrix::MakeFromX(DirUE).Rotator());
	}
	P.Pos = Pos;
	P.Vel = Dir.GetSafeNormal() * Speed;
	P.Radius = Radius;
	P.Life = 1.4f;
	P.bPlayer = true;
	P.bPierce = bPierce;
	P.Info = Info;
	P.Color = bPierce ? 0x9ad8ff : 0xffd27a;
	List.Add(MoveTemp(P));
}

void FLBProjectiles::SpawnOrb(const FVector& Pos, float Yaw, float Speed, float Damage, const FString& StatusType, float StatusTime, int32 Color, const FString& Source)
{
	FProj P;
	P.Actor = G.SpawnVisual();
	if (P.Actor)
	{
		FLBMeshBuilder Core;
		Core.Sphere(FVector::ZeroVector, FVector(28.f), 10, 8, Half(0xffffff));
		FLBMeshBuilder Halo;
		Halo.Sphere(FVector::ZeroVector, FVector(55.f), 10, 8, Half(Color, 0.6f));
		AddMesh(P.Actor, Core, ELBMat::Unlit);
		AddMesh(P.Actor, Halo, ELBMat::Additive);
		P.Actor->SetActorLocation(LB::ToWorld(Pos.X, Pos.Z, Pos.Y));
	}
	P.Pos = Pos;
	P.Vel = FVector(FMath::Sin(Yaw) * Speed, 0.f, FMath::Cos(Yaw) * Speed);
	P.Radius = 0.4f;
	P.Life = 4.f;
	P.bPlayer = false;
	P.Damage = Damage;
	P.StatusType = StatusType;
	P.StatusTime = StatusTime;
	P.Source = Source;
	P.Color = Color;
	List.Add(MoveTemp(P));
}

void FLBProjectiles::Update(float Dt)
{
	ALBArea* Area = G.Area;
	for (FProj& P : List)
	{
		P.Life -= Dt;
		P.Pos += P.Vel * Dt;
		if (!P.bPlayer && Area)
		{
			// Orbs hover at a fixed height above the ground.
			const float Gy = Area->GroundY(P.Pos.X, P.Pos.Z) + 1.1f;
			P.Pos.Y += (Gy - P.Pos.Y) * FMath::Min(1.f, Dt * 4.f);
			if (P.Actor) P.Actor->SetActorScale3D(FVector(1.f + FMath::Sin(P.Life * 20.f) * 0.1f));
		}
		if (P.Actor) P.Actor->SetActorLocation(LB::ToWorld(P.Pos.X, P.Pos.Z, P.Pos.Y));
		if (P.Life <= 0.f) P.bDead = true;
		if (Area && Area->Data)
		{
			// Walls
			if (!Area->Data->IsWalkable(P.Pos.X, P.Pos.Z)) P.bDead = true;
			for (const FLBCollider& C : Area->Colliders)
			{
				if (C.bDisabled || C.H < 1.5f) continue;
				const bool bInside = C.bCircle ? FMath::Square(P.Pos.X - C.X) + FMath::Square(P.Pos.Z - C.Z) < C.R * C.R : (P.Pos.X > C.MinX && P.Pos.X < C.MaxX && P.Pos.Z > C.MinZ && P.Pos.Z < C.MaxZ);
				if (bInside)
				{
					P.bDead = true;
					break;
				}
			}
			if (P.bPlayer && P.Pos.Y < Area->HeightAt(P.Pos.X, P.Pos.Z) - 0.2f) P.bDead = true;
		}
		if (P.bDead) continue;

		if (P.bPlayer)
		{
			TArray<FLBEnemy*> Targets;
			for (const TUniquePtr<FLBEnemy>& E : G.Enemies) Targets.Add(E.Get());
			for (FLBEnemy* E : Targets)
			{
				if (!E->Alive() || !E->bTargetable || P.Hit.Contains(E->Uid)) continue;
				const float Ey = E->Pos.Y + E->AimHeight();
				const float D = FMath::Sqrt(FMath::Square(E->Pos.X - P.Pos.X) + FMath::Square(E->Pos.Z - P.Pos.Z));
				if (D < E->Radius + P.Radius && FMath::Abs(Ey - P.Pos.Y) < E->ModelHeight() * 0.7f + 0.5f)
				{
					P.Hit.Add(E->Uid);
					FLBHitInfo H = P.Info;
					H.FromX = P.Pos.X - P.Vel.X * 0.05f;
					H.FromZ = P.Pos.Z - P.Vel.Z * 0.05f;
					G.HitEnemy(*E, H);
					if (!P.bPierce)
					{
						P.bDead = true;
						break;
					}
				}
			}
		}
		else
		{
			FLBPlayer& Pl = *G.Player;
			if (Pl.Alive() && FMath::Sqrt(FMath::Square(Pl.Pos.X - P.Pos.X) + FMath::Square(Pl.Pos.Z - P.Pos.Z)) < Pl.Radius + P.Radius)
			{
				FLBEnemyHit H;
				H.Damage = P.Damage;
				H.FromX = P.Pos.X;
				H.FromZ = P.Pos.Z;
				H.Knockback = 0.8f;
				H.StatusType = P.StatusType;
				H.StatusTime = P.StatusTime;
				H.Source = P.Source.IsEmpty() ? FString(TEXT("orb")) : P.Source;
				const bool bLanded = G.HitPlayer(H);
				if (bLanded || !Pl.Invulnerable()) P.bDead = true;
			}
		}
		if (P.bDead && G.Fx)
		{
			FLBBurst B;
			B.Count = 8;
			B.Color = P.Color;
			B.Speed = 3.f;
			B.Life = 0.3f;
			G.Fx->Burst(P.Pos.X, P.Pos.Y, P.Pos.Z, B);
		}
	}
	for (int32 I = List.Num() - 1; I >= 0; I--)
	{
		if (!List[I].bDead) continue;
		DestroyActor(List[I].Actor);
		List.RemoveAt(I);
	}
}

void FLBProjectiles::Clear()
{
	for (FProj& P : List) DestroyActor(P.Actor);
	List.Reset();
}

// =================================================================== Hazards

void FLBHazards::Draw(FHaz& H)
{
	if (!H.Actor) return;
	FLBMeshBuilder M;
	if (H.bRing)
	{
		// Unit ring scaled to the current radius, plus a short wall so it reads as something to dodge through.
		M.Sector(FVector(0, 0, 25.f), 85.f, 100.f, 0.f, 360.f, 64, Half(H.Color, 0.85f));
		FLBMeshBuilder Wall;
		Wall.Cylinder(FVector::ZeroVector, 100.f, 100.f, 120.f, 48, Half(H.Color, 0.35f), false);
		H.Mesh = AddMesh(H.Actor, M, ELBMat::Additive);
		AddMesh(H.Actor, Wall, ELBMat::Additive, 1, H.Mesh);
	}
	else
	{
		M.Sector(FVector(0, 0, 10.f), (H.Radius - 0.2f) * 100.f, H.Radius * 100.f, 0.f, 360.f, 48, Half(0xffc060, 0.6f));
		H.Mesh = AddMesh(H.Actor, M, ELBMat::Additive);
	}
}

void FLBHazards::Ring(const FVector& Center, float MaxRadius, float Speed, float Damage, int32 Color, const FString& Source)
{
	FHaz H;
	H.bRing = true;
	H.Center = Center;
	H.Radius = 1.f;
	H.MaxRadius = MaxRadius;
	H.Speed = Speed;
	H.Damage = Damage;
	H.Color = Color;
	H.Source = Source;
	H.Actor = G.SpawnVisual();
	if (H.Actor) H.Actor->Place(Center.X, Center.Y, Center.Z, 0.f);
	Draw(H);
	List.Add(H);
}

void FLBHazards::EmberRain(const FVector& Center, float Radius, float Duration, float DamageMult)
{
	FHaz H;
	H.bRing = false;
	H.Center = Center;
	H.Radius = Radius;
	H.Duration = Duration;
	H.Damage = DamageMult;
	H.TickT = 0.2f;
	H.Actor = G.SpawnVisual();
	if (H.Actor) H.Actor->Place(Center.X, Center.Y, Center.Z, 0.f);
	Draw(H);
	List.Add(H);
}

void FLBHazards::Update(float Dt)
{
	for (FHaz& H : List)
	{
		if (H.bRing)
		{
			H.Radius += H.Speed * Dt;
			if (H.Mesh) H.Mesh->SetRelativeScale3D(FVector(H.Radius, H.Radius, 1.f));
			FLBPlayer& P = *G.Player;
			const float D = FMath::Sqrt(FMath::Square(P.Pos.X - H.Center.X) + FMath::Square(P.Pos.Z - H.Center.Z));
			if (!H.bHit && P.Alive() && FMath::Abs(D - H.Radius) < 0.7f + P.Radius)
			{
				FLBEnemyHit Hit;
				Hit.Damage = H.Damage;
				Hit.FromX = H.Center.X;
				Hit.FromZ = H.Center.Z;
				Hit.Knockback = 2.f;
				Hit.Source = H.Source;
				if (G.HitPlayer(Hit)) H.bHit = true;
			}
		}
		else
		{
			H.T += Dt;
			H.TickT -= Dt;
			for (int32 I = 0; I < 3; I++)
			{
				const float A = G.Rng.FRand() * UE_PI * 2.f;
				const float R = FMath::Sqrt(G.Rng.FRand()) * H.Radius;
				FLBBurst B;
				B.Count = 1;
				B.Color = 0xffa040;
				B.Speed = 0.5f;
				B.Life = 0.5f;
				B.Gravity = 30.f;
				B.Size = 1;
				G.Fx->Burst(H.Center.X + FMath::Cos(A) * R, H.Center.Y + 6.f, H.Center.Z + FMath::Sin(A) * R, B);
			}
			if (H.TickT <= 0.f)
			{
				H.TickT = 0.25f;
				TArray<FLBEnemy*> Targets;
				for (const TUniquePtr<FLBEnemy>& E : G.Enemies) Targets.Add(E.Get());
				for (FLBEnemy* E : Targets)
				{
					if (!E->Alive() || !E->bTargetable) continue;
					if (FMath::Sqrt(FMath::Square(E->Pos.X - H.Center.X) + FMath::Square(E->Pos.Z - H.Center.Z)) < H.Radius + E->Radius)
					{
						FLBHitInfo Hit;
						Hit.Mult = H.Damage;
						Hit.Poise = 6.f;
						Hit.Knockback = 0.3f;
						Hit.FromX = H.Center.X;
						Hit.FromZ = H.Center.Z;
						Hit.bNoHitstop = true;
						Hit.Source = TEXT("ability");
						G.HitEnemy(*E, Hit);
					}
				}
				FLBBurst B;
				B.Count = 6;
				B.Color = 0xffc060;
				B.Speed = 3.f;
				B.Life = 0.4f;
				B.Spread = H.Radius;
				G.Fx->Burst(H.Center.X, H.Center.Y + 0.2f, H.Center.Z, B);
			}
		}
	}
	for (int32 I = List.Num() - 1; I >= 0; I--)
	{
		const FHaz& H = List[I];
		if (H.bRing ? H.Radius >= H.MaxRadius : H.T >= H.Duration)
		{
			DestroyActor(List[I].Actor);
			List.RemoveAt(I);
		}
	}
}

void FLBHazards::Clear()
{
	for (FHaz& H : List) DestroyActor(H.Actor);
	List.Reset();
}

// =================================================================== Pickups

void FLBPickups::Spawn(const FLBPickupContent& C, float X, float Y, float Z)
{
	FPick P;
	P.Content = C;
	P.Pos = FVector(X, Y + 0.5f, Z);
	const float A = G.Rng.FRand() * UE_PI * 2.f;
	P.Vel = FVector(FMath::Cos(A) * 2.5f, 5.f, FMath::Sin(A) * 2.5f);
	P.Actor = G.SpawnVisual();
	if (P.Actor)
	{
		FLinearColor Col = LB::Hex(0xffd27a);
		if (C.Kind == FLBPickupContent::Item) Col = LB::Hex(0x8ad8ff);
		if (C.Kind == FLBPickupContent::Equipment) Col = RarityHex(C.Gen.Rarity);
		const bool bEquip = C.Kind == FLBPickupContent::Equipment;
		const float S = bEquip ? 28.f : 16.f;
		FLBMeshBuilder Core;
		const FVector Pts[6] = {FVector(S, 0, 0), FVector(-S, 0, 0), FVector(0, S, 0), FVector(0, -S, 0), FVector(0, 0, S), FVector(0, 0, -S)};
		const int32 Faces[8][3] = {{0, 2, 4}, {2, 1, 4}, {1, 3, 4}, {3, 0, 4}, {2, 0, 5}, {1, 2, 5}, {3, 1, 5}, {0, 3, 5}};
		for (const auto& F : Faces) Core.Tri(Pts[F[0]], Pts[F[1]], Pts[F[2]], Col * 0.5f);
		FLBMeshBuilder Halo;
		FLinearColor HC = Col * 0.5f;
		HC.A = 0.3f;
		Halo.Sphere(FVector::ZeroVector, FVector(bEquip ? 60.f : 35.f), 10, 8, HC);
		if (bEquip)
		{
			FLinearColor BC = Col * 0.5f;
			BC.A = 0.35f;
			Halo.Cylinder(FVector::ZeroVector, 30.f, 15.f, 600.f, 8, BC, false);
		}
		AddMesh(P.Actor, Core, ELBMat::Unlit);
		AddMesh(P.Actor, Halo, ELBMat::Additive);
		P.Actor->SetActorLocation(LB::ToWorld(P.Pos.X, P.Pos.Z, P.Pos.Y));
	}
	List.Add(P);
}

TArray<FLBPickupContent> FLBPickups::Update(float Dt, const FVector& Player)
{
	TArray<FLBPickupContent> Got;
	const FVector Target(Player.X, Player.Y + 1.f, Player.Z);
	for (FPick& P : List)
	{
		P.T += Dt;
		const float D = FVector::Dist(P.Pos, Target);
		const bool bAuto = P.Content.Kind != FLBPickupContent::Equipment;
		if ((bAuto && P.T > 0.6f && D < 7.f) || (!bAuto && D < 2.2f) || P.bMagnet)
		{
			P.bMagnet = true;
			const FVector Dir = Target - P.Pos;
			const float Len = Dir.Size();
			P.Pos += Dir.GetSafeNormal() * FMath::Min(Len, (8.f + P.T * 6.f) * Dt);
			if (Len < 0.5f)
			{
				Got.Add(P.Content);
				P.T = -999.f;
			}
		}
		else
		{
			P.Vel.Y -= 14.f * Dt;
			P.Pos += P.Vel * Dt;
			const float Gy = (G.Area ? G.Area->GroundY(P.Pos.X, P.Pos.Z) : 0.f) + 0.4f;
			if (P.Pos.Y < Gy)
			{
				P.Pos.Y = Gy;
				P.Vel = FVector::ZeroVector;
			}
		}
		if (P.Actor)
		{
			P.Actor->SetActorLocation(LB::ToWorld(P.Pos.X, P.Pos.Z, P.Pos.Y + FMath::Sin(P.T * 3.f) * 0.08f));
			P.Actor->AddActorLocalRotation(FRotator(0.f, Dt * 115.f, 0.f));
		}
	}
	for (int32 I = List.Num() - 1; I >= 0; I--)
	{
		if (List[I].T >= 0.f) continue;
		DestroyActor(List[I].Actor);
		List.RemoveAt(I);
	}
	return Got;
}

void FLBPickups::Clear()
{
	for (FPick& P : List) DestroyActor(P.Actor);
	List.Reset();
}

// =================================================================== NPCs

FLBNpc::FLBNpc(FLBGame& InG, const FString& InId, float X, float Y, float Z, float InYaw) : G(InG)
{
	Id = InId;
	Name = G.D ? G.D->NpcName(InId) : InId;
	Pos = FVector(X, Y, Z);
	Yaw = BaseYaw = InYaw;
	T = G.Rng.FRand() * 10.f;
	Actor = G.SpawnVisual();
	if (Actor)
	{
		Rig = LBRigBuilder::ForModel(Actor, Actor->GetRootComponent(), InId, G.Mat);
		Actor->Place(X, Y, Z, Yaw);
	}
}

FLBNpc::~FLBNpc()
{
	DestroyActor(Actor);
}

void FLBNpc::Update(float Dt, const FVector& PlayerPos)
{
	T += Dt;
	const float D = FVector::Dist(Pos, PlayerPos);
	const float Target = D < 5.f || bTalking ? YawTo(Pos.X, Pos.Z, PlayerPos.X, PlayerPos.Z) : BaseYaw;
	Yaw = ApproachAngle(Yaw, Target, 3.f * Dt);
	if (Actor) Actor->Place(Pos.X, Pos.Y, Pos.Z, Yaw);
	Rig.Animate(bTalking ? TEXT("talk") : TEXT("idle"), FString(), T, 0.f, 0.f, Dt);
}

// =================================================================== Companion

FLBCompanion::FLBCompanion(FLBGame& InG) : G(InG)
{
	Actor = G.SpawnVisual();
	if (Actor) Rig = LBRigBuilder::ForModel(Actor, Actor->GetRootComponent(), TEXT("kohaku"), G.Mat);
}

FLBCompanion::~FLBCompanion()
{
	DestroyActor(Actor);
}

void FLBCompanion::Place(float X, float Y, float Z)
{
	Pos = FVector(X, Y, Z);
	if (Actor) Actor->Place(X, Y, Z, Yaw);
	State = TEXT("follow");
	Target = nullptr;
}

void FLBCompanion::Bark(const FString& Kind)
{
	if (BarkCd > 0.f) return;
	BarkCd = 14.f;
	TArray<FString> Lines;
	if (Kind == TEXT("lowHp")) Lines = {TEXT("Warden! Eat something before you fall over!"), TEXT("You look terrible. Heal up!")};
	else if (Kind == TEXT("boss")) Lines = {TEXT("That's a big one. I'll go for its ankles."), TEXT("Here we go. Stay light on your feet!")};
	else Lines = {TEXT("Ha! Another one crosses over."), TEXT("Nicely done."), TEXT("That one smelled awful.")};
	G.Caption(Lines[G.Rng.RandRange(0, Lines.Num() - 1)], TEXT("Kohaku"), 2.5f);
}

void FLBCompanion::MoveToward(float X, float Z, float Speed, float Dt)
{
	const float Y = YawTo(Pos.X, Pos.Z, X, Z);
	Yaw = ApproachAngle(Yaw, Y, 10.f * Dt);
	const FVector2D R = G.Area ? G.Area->Move(Pos.X, Pos.Z, FMath::Sin(Y) * Speed * Dt, FMath::Cos(Y) * Speed * Dt, 0.35f) : FVector2D(Pos.X, Pos.Z);
	Pos.X = R.X;
	Pos.Z = R.Y;
	SpeedNow = Speed;
}

void FLBCompanion::Update(float Dt)
{
	T += Dt;
	StateT += Dt;
	Cd -= Dt;
	BarkCd -= Dt;
	FLBPlayer& P = *G.Player;
	const float HpFrac = P.Hp / FMath::Max(1.f, G.Stats().MaxHp);
	if (HpFrac < 0.3f && !bLowHpBarked && P.Alive())
	{
		bLowHpBarked = true;
		Bark(TEXT("lowHp"));
	}
	if (HpFrac > 0.6f) bLowHpBarked = false;

	if (FVector::Dist(Pos, P.Pos) > 22.f)
	{
		// Spirits can simply reappear beside their friend.
		const float X = P.Pos.X - FMath::Sin(P.Yaw) * 1.5f;
		const float Z = P.Pos.Z - FMath::Cos(P.Yaw) * 1.5f;
		FLBBurst B;
		B.Count = 12;
		B.Color = 0xffd27a;
		B.Speed = 2.f;
		B.Life = 0.6f;
		B.Size = 1;
		G.Fx->Burst(X, G.Area->GroundY(X, Z) + 0.5f, Z, B);
		Pos = FVector(X, 0.f, Z);
		State = TEXT("follow");
	}

	if (Target && (!Target->Alive() || !Target->bTargetable)) Target = nullptr;
	if (!Target && State == TEXT("follow") && Cd <= 0.f)
	{
		FLBEnemy* Lock = G.LockTarget();
		if (Lock && Lock->Def.Behavior != TEXT("dummy")) Target = Lock;
		else
		{
			FLBEnemy* Best = nullptr;
			float Bd = 9.f;
			for (const TUniquePtr<FLBEnemy>& E : G.Enemies)
			{
				if (!E->Alive() || !E->bTargetable || !E->bAggro || E->Def.Behavior == TEXT("dummy")) continue;
				const float D = FVector::Dist(E->Pos, P.Pos);
				if (D < Bd)
				{
					Bd = D;
					Best = E.Get();
				}
			}
			Target = Best;
		}
		if (Target) State = TEXT("attack");
	}

	SpeedNow = 0.f;
	if (State == TEXT("follow"))
	{
		const float Fx = P.Pos.X - FMath::Sin(P.Yaw + 0.8f) * 2.f;
		const float Fz = P.Pos.Z - FMath::Cos(P.Yaw + 0.8f) * 2.f;
		const float D = FMath::Sqrt(FMath::Square(Fx - Pos.X) + FMath::Square(Fz - Pos.Z));
		if (D > 0.6f) MoveToward(Fx, Fz, FMath::Min(9.f, 3.f + D * 1.5f), Dt);
		else Yaw = ApproachAngle(Yaw, P.Yaw, 3.f * Dt);
	}
	else if (State == TEXT("attack"))
	{
		if (!Target) State = TEXT("follow");
		else
		{
			const float D = Dist2(Target->Pos, Pos) - Target->Radius;
			if (D > 1.3f) MoveToward(Target->Pos.X, Target->Pos.Z, 8.f, Dt);
			else
			{
				State = TEXT("windup");
				StateT = 0.f;
			}
			if (StateT > 4.f) State = TEXT("follow");
		}
	}
	else if (State == TEXT("windup"))
	{
		if (Target) Yaw = ApproachAngle(Yaw, YawTo(Pos.X, Pos.Z, Target->Pos.X, Target->Pos.Z), 10.f * Dt);
		if (StateT > 0.3f)
		{
			FLBEnemy* E = Target;
			if (E && E->Alive() && Dist2(E->Pos, Pos) - E->Radius < 2.f)
			{
				FLBHitInfo H;
				H.Mult = 0.45f;
				H.Poise = 6.f;
				H.Knockback = 0.5f;
				H.FromX = Pos.X;
				H.FromZ = Pos.Z;
				H.bNoHitstop = true;
				H.Source = TEXT("companion");
				const FVector At = E->Pos;
				G.HitEnemy(*E, H);
				FLBBurst B;
				B.Count = 8;
				B.Color = 0xffd27a;
				B.Speed = 3.f;
				B.Life = 0.3f;
				G.Fx->Burst(At.X, At.Y + 0.8f, At.Z, B);
			}
			State = TEXT("recover");
			StateT = 0.f;
		}
	}
	else if (State == TEXT("recover"))
	{
		if (StateT > 0.5f)
		{
			Cd = 1.4f;
			State = TEXT("follow");
			Target = nullptr;
			StateT = 0.f;
		}
	}
	const float Gy = G.Area ? G.Area->GroundY(Pos.X, Pos.Z) : 0.f;
	Pos.Y = Gy;
	if (Actor) Actor->Place(Pos.X, Gy + 0.05f + FMath::Sin(T * 2.f) * 0.04f, Pos.Z, Yaw);
	const FString AnimMode = State == TEXT("windup") ? TEXT("windup") : (State == TEXT("recover") && StateT < 0.2f) ? TEXT("active") : SpeedNow > 0.3f ? TEXT("move") : TEXT("idle");
	Rig.Animate(AnimMode, FString(), T, SpeedNow, 0.f, Dt);
}
