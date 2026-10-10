// Enemy and boss behaviour (port of src/entities/enemy.ts): perception,
// positioning, telegraphed attacks, poise/stagger, status effects and boss phases.

#include "LBEntities.h"
#include "LBGame.h"
#include "LBArea.h"
#include "LBFx.h"
#include "LBData.h"
#include "LBMath.h"
#include "LBMeshKit.h"
#include "LBVisual.h"
#include "Components/PointLightComponent.h"
#include "ProceduralMeshComponent.h"

using namespace LBMathG;

FLBEnemy::FLBEnemy(FLBGame& InG, const FLBEnemyDef& InDef, int32 InLevel, const FString& InSpawnId, float HealthMult)
	: Def(InDef), G(InG)
{
	Level = InLevel;
	SpawnId = InSpawnId;
	const float L = float(FMath::Max(1, InLevel) - 1);
	MaxHp = FMath::RoundToFloat(FMath::RoundToFloat(Def.Hp * (1.f + 0.2f * L)) * (Def.Id == TEXT("training_dummy") ? 1.f : HealthMult));
	Hp = MaxHp;
	Atk = Def.Atk * (1.f + 0.13f * L);
	Defense = Def.Def + L;
	Xp = FMath::RoundToInt(Def.Xp * (1.f + 0.22f * L));
	CoinMult = 1.f + 0.15f * L;
	Radius = Def.Radius;
	Poise = Def.Poise;
	bBoss = Def.IsBoss;
	AnimT = G.Rng.FRand() * 10.f;
	Actor = G.SpawnVisual();
	if (Actor)
	{
		Rig = LBRigBuilder::ForModel(Actor, Actor->GetRootComponent(), Def.Model, G.Mat);
		Glow = Actor->AddLight(FVector(0.f, 0.f, Rig.Height * 0.6f), 0xff3020, 0.f, FMath::Max(300.f, Rig.Height * 2.f));
	}
}

FLBEnemy::~FLBEnemy()
{
	Dispose();
}

float FLBEnemy::AimHeight() const
{
	return Def.Flying ? 1.5f : ModelHeight() * 0.55f;
}

float FLBEnemy::Dmg(const FLBEnemyAttack& A) const
{
	return Atk * A.Damage * G.EnemyDamageMult();
}

void FLBEnemy::Place(float X, float Y, float Z, float InYaw)
{
	Pos = FVector(X, Y, Z);
	Home = Pos;
	Yaw = InYaw;
	if (Actor) Actor->Place(X, Y, Z, Yaw);
}

void FLBEnemy::SetHidden(bool bHide)
{
	bHidden = bHide;
	if (Actor) Actor->SetActorHiddenInGame(bHide);
}

// =================================================================== Update

void FLBEnemy::Update(float Dt)
{
	StateT += Dt;
	AnimT += Dt;
	for (TPair<FString, float>& C : Cooldowns) C.Value -= Dt;
	GlobalCd -= Dt;
	EvadeT -= Dt;
	FlinchCd -= Dt;
	StaggerImmuneT -= Dt;
	PoiseRegenT -= Dt;
	if (PoiseRegenT <= 0.f && Poise < Def.Poise) Poise = Def.Poise;
	UpdateDots(Dt);

	if (State == TEXT("dead"))
	{
		DeadT += Dt;
		Rig.Animate(TEXT("dead"), FString(), AnimT, 0.f, FMath::Clamp(DeadT / 1.2f, 0.f, 1.f), Dt);
		if (Glow) Glow->SetIntensity(0.f);
		if (DeadT > 1.6f && Actor) Actor->AddActorWorldOffset(FVector(0.f, 0.f, -Dt * 120.f));
		if (DeadT > 2.6f) bRemoved = true;
		return;
	}

	FLBPlayer& P = *G.Player;
	const float Dx = P.Pos.X - Pos.X;
	const float Dz = P.Pos.Z - Pos.Z;
	const float Dist = FMath::Sqrt(Dx * Dx + Dz * Dz);
	const float ToPlayer = FMath::Atan2(Dx, Dz);

	if (Def.Behavior == TEXT("dummy"))
	{
		Animate(Dt, 0.f);
		SyncTransform();
		return;
	}

	if (StunT > 0.f)
	{
		StunT -= Dt;
		if (State != TEXT("stagger")) SetState(TEXT("stagger"));
	}

	if (bDormant)
	{
		Yaw = ApproachAngle(Yaw, ToPlayer, 1.5f * Dt);
		Animate(Dt, 0.f);
		SyncTransform();
		return;
	}
	if (!bAggro && P.Alive() && Dist < Def.AggroRange && State != TEXT("return"))
	{
		bAggro = true;
		AlertAllies();
	}
	if (!P.Alive() && bAggro && !bBoss)
	{
		bAggro = false;
		CancelAttack();
		SetState(TEXT("return"));
	}

	if (State == TEXT("idle")) UpdateIdle(Dt);
	else if (State == TEXT("return"))
	{
		const float Hd = Dist2(Home, Pos);
		MoveToward(Home.X, Home.Z, Def.Speed * 1.2f, Dt);
		Hp = FMath::Min(MaxHp, Hp + MaxHp * 0.4f * Dt);
		if (Hd < 1.f)
		{
			Hp = MaxHp;
			SetState(TEXT("idle"));
		}
	}
	else if (State == TEXT("intro"))
	{
		Yaw = ApproachAngle(Yaw, ToPlayer, 3.f * Dt);
		if (StateT > 2.6f)
		{
			bAggro = true;
			SetState(TEXT("chase"));
		}
	}
	else if (State == TEXT("phase"))
	{
		Yaw = ApproachAngle(Yaw, ToPlayer, 3.f * Dt);
		if (StateT > 1.8f)
		{
			bInvulnerable = false;
			SetState(TEXT("chase"));
		}
	}
	else if (State == TEXT("chase") || State == TEXT("strafe")) UpdateCombat(Dt, Dist, ToPlayer);
	else if (State == TEXT("windup")) UpdateWindup(Dt, ToPlayer);
	else if (State == TEXT("active")) UpdateActive(Dt);
	else if (State == TEXT("recover"))
	{
		if (StateT >= (Attack ? Attack->Recovery : 0.5f)) FinishAttack();
	}
	else if (State == TEXT("hit"))
	{
		if (StateT >= 0.28f) SetState(bAggro ? TEXT("chase") : TEXT("idle"));
	}
	else if (State == TEXT("stagger"))
	{
		if (StunT <= 0.f && StateT >= (bBoss ? 2.4f : 1.2f))
		{
			Poise = Def.Poise;
			StaggerImmuneT = bBoss ? 6.f : 3.f;
			GlobalCd = FMath::Min(GlobalCd, 0.2f);
			SetState(TEXT("chase"));
		}
	}

	// Leash
	if (bAggro && !bBoss && !bSummoned && Dist2(Pos, Home) > Def.Leash && State != TEXT("windup") && State != TEXT("active"))
	{
		bAggro = false;
		CancelAttack();
		SetState(TEXT("return"));
	}

	// Knockback
	if (Vel.SizeSquared() > 0.001f)
	{
		MoveBy(Vel.X * Dt, Vel.Z * Dt);
		Vel *= FMath::Exp(-7.f * Dt);
	}
	UpdateTelegraphFollow();
	Animate(Dt, MoveSpeedNow);
	SyncTransform();
}

void FLBEnemy::SyncTransform()
{
	if (!G.Area) return;
	const float Gy = G.Area->GroundY(Pos.X, Pos.Z);
	Pos.Y = Gy;
	if (Actor) Actor->Place(Pos.X, Gy + LeapHeight, Pos.Z, Yaw);
}

void FLBEnemy::UpdateIdle(float Dt)
{
	MoveSpeedNow = 0.f;
	WanderT -= Dt;
	if (WanderT <= 0.f)
	{
		WanderT = 3.f + G.Rng.FRand() * 4.f;
		const float A = G.Rng.FRand() * UE_PI * 2.f;
		const float R = G.Rng.FRand() * 3.f;
		WanderTarget = FVector(Home.X + FMath::Cos(A) * R, 0.f, Home.Z + FMath::Sin(A) * R);
	}
	const float D = Dist2(WanderTarget, Pos);
	if (D > 0.5f && Def.Speed > 0.f) MoveToward(WanderTarget.X, WanderTarget.Z, Def.Speed * 0.3f, Dt);
	if (bAggro) SetState(TEXT("chase"));
}

void FLBEnemy::UpdateCombat(float Dt, float Dist, float ToPlayer)
{
	FLBPlayer& P = *G.Player;
	if (!P.Alive())
	{
		MoveSpeedNow = 0.f;
		return;
	}
	const FString& B = Def.Behavior;
	const float Gap = Dist - Radius - P.Radius;

	// Evasive enemies sidestep the player's swings.
	if (Def.Evade > 0.f && P.State == TEXT("attack") && P.StateT < 0.06f && Gap < 2.5f && EvadeT <= 0.f)
	{
		EvadeT = 1.5f;
		if (G.Rng.FRand() < Def.Evade)
		{
			const float Side = G.Rng.FRand() < 0.5f ? 1.f : -1.f;
			const float A = ToPlayer + UE_PI + Side * 0.9f;
			Vel = FVector(FMath::Sin(A) * 9.f, 0.f, FMath::Cos(A) * 9.f);
			FLBBurst Bu;
			Bu.Count = 8;
			Bu.Color = 0x6a3a8a;
			Bu.Speed = 2.f;
			Bu.Life = 0.4f;
			Bu.Size = 1;
			G.Fx->Burst(Pos.X, Pos.Y + 0.5f, Pos.Z, Bu);
			return;
		}
	}

	// Pick an attack
	if (GlobalCd <= 0.f)
	{
		if (const FLBEnemyAttack* Atk2 = ChooseAttack(Gap))
		{
			const bool bNeedsToken = !bBoss && B != TEXT("swarm");
			if (!bNeedsToken || bHasToken || G.RequestToken(*this))
			{
				if (bNeedsToken) bHasToken = true;
				BeginAttack(*Atk2);
				return;
			}
		}
	}

	// Positioning
	const float Pref = Def.PreferredRange;
	float Speed = Def.Speed;
	StrafeT -= Dt;
	if (StrafeT <= 0.f)
	{
		StrafeT = 1.2f + G.Rng.FRand() * 1.5f;
		StrafeDir = G.Rng.FRand() < 0.5f ? 1.f : -1.f;
	}
	if (Pref > 0.f)
	{
		if (Dist < Pref * 0.6f) MoveDir(ToPlayer + UE_PI, Speed * 0.9f, Dt);
		else if (Dist > Pref * 1.25f) MoveDir(ToPlayer, Speed, Dt);
		else MoveDir(ToPlayer + StrafeDir * UE_PI / 2.f, Speed * 0.5f, Dt);
	}
	else
	{
		const bool bHoldOff = !bBoss && B != TEXT("swarm") && !bHasToken && Gap < 4.5f;
		if (bHoldOff || (B == TEXT("skirmisher") && Gap < 3.5f && GlobalCd > 0.f))
		{
			// Circle the player while waiting for an opening.
			const float Ang = ToPlayer + UE_PI / 2.f * StrafeDir;
			MoveDir(Ang + (Gap < 3.f ? 0.6f * StrafeDir : 0.f), Speed * 0.45f, Dt);
		}
		else if (Gap > PreferredMelee())
		{
			if (B == TEXT("heavy")) Speed *= 0.9f;
			MoveDir(ToPlayer, Speed, Dt);
		}
		else MoveSpeedNow = 0.f;
	}
	Yaw = ApproachAngle(Yaw, ToPlayer, 8.f * Dt);
}

float FLBEnemy::PreferredMelee() const
{
	float Best = 1.2f;
	for (const FLBEnemyAttack& A : Def.Attacks)
	{
		if (A.Kind == TEXT("melee")) Best = FMath::Max(Best, A.Range * 0.75f);
	}
	return Best;
}

const FLBEnemyAttack* FLBEnemy::ChooseAttack(float Gap)
{
	TArray<const FLBEnemyAttack*> Options;
	float Total = 0.f;
	for (const FLBEnemyAttack& A : Def.Attacks)
	{
		if (Cooldowns.FindRef(A.Id) > 0.f) continue;
		if (A.Phase > Phase) continue;
		if (Gap > A.Range) continue;
		if (A.MinRange > 0.f && Gap < A.MinRange) continue;
		if (A.Kind == TEXT("summon"))
		{
			int32 Minions = 0;
			for (const TUniquePtr<FLBEnemy>& E : G.Enemies) Minions += (E->bSummoned && E->Alive()) ? 1 : 0;
			if (Minions >= 3) continue;
		}
		Options.Add(&A);
		Total += A.Weight;
	}
	if (Options.Num() == 0) return nullptr;
	float R = G.Rng.FRand() * Total;
	for (const FLBEnemyAttack* A : Options)
	{
		R -= A->Weight;
		if (R <= 0.f) return A;
	}
	return Options.Last();
}

// =================================================================== Attacks

void FLBEnemy::BeginAttack(const FLBEnemyAttack& A)
{
	Attack = &A;
	SetState(TEXT("windup"));
	bHitLanded = false;
	Tick = 0.f;
	FLBPlayer& P = *G.Player;
	const float Gy = Pos.Y;
	if (!A.Callout.IsEmpty()) G.Caption(A.Callout, FString(), 2.2f);
	if (bBoss || A.Windup >= 0.8f) G.Sfx(TEXT("enemyWindup"), Pos.X, Pos.Z, bBoss ? 1.f : 0.6f);
	const FString& K = A.Kind;
	if (K == TEXT("melee"))
	{
		Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Cone, A.Range + Radius, FMath::Min(359.f, A.Arc), Pos.X, Gy, Pos.Z, Yaw, A.Windup));
	}
	else if (K == TEXT("charge"))
	{
		const float Len = (A.Speed > 0.f ? A.Speed : 10.f) * A.Active + Radius;
		Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Line, Len, Radius * 2.f + 0.6f, Pos.X, Gy, Pos.Z, Yaw, A.Windup));
	}
	else if (K == TEXT("leap"))
	{
		LeapTo = P.Pos;
		Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Circle, A.Radius > 0.f ? A.Radius : 3.f, 0.f, P.Pos.X, P.Pos.Y, P.Pos.Z, 0.f, A.Windup + A.Active));
	}
	else if (K == TEXT("slam"))
	{
		Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Circle, A.Radius > 0.f ? A.Radius : 3.f, 0.f, Pos.X, Gy, Pos.Z, 0.f, A.Windup));
	}
	else if (K == TEXT("pillars"))
	{
		PillarPos.Reset();
		const int32 N = FMath::Max(1, A.Count);
		if (N == 1) PillarPos.Add(P.Pos);
		else if (Def.Id == TEXT("kuroganemaru"))
		{
			// A fissure running from the Oni toward the player.
			const float Y = YawTo(Pos.X, Pos.Z, P.Pos.X, P.Pos.Z);
			for (int32 I = 1; I <= N; I++)
			{
				const float D = I * 2.8f;
				const float X = Pos.X + FMath::Sin(Y) * D;
				const float Z = Pos.Z + FMath::Cos(Y) * D;
				PillarPos.Add(FVector(X, G.Area->GroundY(X, Z), Z));
			}
		}
		else
		{
			PillarPos.Add(P.Pos);
			for (int32 I = 1; I < N; I++)
			{
				const float Ang = G.Rng.FRand() * UE_PI * 2.f;
				const float R = 3.f + G.Rng.FRand() * 7.f;
				const float X = P.Pos.X + FMath::Cos(Ang) * R;
				const float Z = P.Pos.Z + FMath::Sin(Ang) * R;
				PillarPos.Add(FVector(X, G.Area->GroundY(X, Z), Z));
			}
		}
		for (const FVector& Pp : PillarPos) Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Circle, A.Radius > 0.f ? A.Radius : 2.f, 0.f, Pp.X, Pp.Y, Pp.Z, 0.f, A.Windup));
	}
	else if (K == TEXT("ring"))
	{
		Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Ring, 2.5f, 0.f, Pos.X, Gy, Pos.Z, 0.f, A.Windup));
	}
	else if (K == TEXT("beam"))
	{
		BeamYaw = YawTo(Pos.X, Pos.Z, P.Pos.X, P.Pos.Z) - 0.9f;
		Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Line, A.Radius > 0.f ? A.Radius : 20.f, 2.2f, Pos.X, Gy, Pos.Z, BeamYaw, A.Windup));
	}
	else if (K == TEXT("dive"))
	{
		bTargetable = false;
		SetHidden(true);
		FLBBurst B;
		B.Count = 30;
		B.Color = 0x6a4a8a;
		B.Speed = 5.f;
		B.Life = 0.8f;
		B.Size = 1;
		G.Fx->Burst(Pos.X, Pos.Y + 2.f, Pos.Z, B);
		LeapTo = P.Pos;
		Telegraphs.Add(G.Fx->Telegraph(ELBTeleShape::Circle, A.Radius > 0.f ? A.Radius : 3.f, 0.f, P.Pos.X, P.Pos.Y, P.Pos.Z, 0.f, A.Windup));
	}
}

/** Moves telegraphs that track the enemy or the player (the web build's tg.follow). */
void FLBEnemy::UpdateTelegraphFollow()
{
	if (!Attack || Telegraphs.Num() == 0 || (State != TEXT("windup") && State != TEXT("active"))) return;
	const FLBEnemyAttack& A = *Attack;
	const FString& K = A.Kind;
	const FLBPlayer& P = *G.Player;
	const int32 H = Telegraphs.Last();
	if (K == TEXT("melee") || K == TEXT("charge") || K == TEXT("slam") || K == TEXT("ring")) G.Fx->MoveTelegraph(H, Pos.X, Pos.Y, Pos.Z, Yaw);
	else if (K == TEXT("beam")) G.Fx->MoveTelegraph(H, Pos.X, Pos.Y, Pos.Z, BeamYaw);
	else if (K == TEXT("leap"))
	{
		if (StateT < A.Windup * 0.7f && State == TEXT("windup")) G.Fx->MoveTelegraph(H, P.Pos.X, P.Pos.Y, P.Pos.Z, 0.f);
		else G.Fx->MoveTelegraph(H, LeapTo.X, LeapTo.Y, LeapTo.Z, 0.f);
	}
	else if (K == TEXT("dive"))
	{
		if (StateT < A.Windup - 0.7f && State == TEXT("windup")) LeapTo = P.Pos;
		G.Fx->MoveTelegraph(H, LeapTo.X, LeapTo.Y, LeapTo.Z, 0.f);
	}
	else if (K == TEXT("pillars") && PillarPos.Num() == 1)
	{
		// Single pillars track the player for the first half of the wind-up.
		if (StateT < A.Windup * 0.5f && State == TEXT("windup")) PillarPos[0] = P.Pos;
		G.Fx->MoveTelegraph(H, PillarPos[0].X, PillarPos[0].Y, PillarPos[0].Z, 0.f);
	}
}

void FLBEnemy::UpdateWindup(float Dt, float ToPlayer)
{
	const FLBEnemyAttack& A = *Attack;
	MoveSpeedNow = 0.f;
	// Track the player, but commit to a direction for the last 35% of the wind-up.
	const bool bCommit = StateT > A.Windup * 0.65f;
	if (A.Kind != TEXT("beam") && A.Kind != TEXT("dive") && !bCommit) Yaw = ApproachAngle(Yaw, ToPlayer, (bBoss ? 4.f : 6.f) * Dt);
	if (A.Kind == TEXT("beam")) Yaw = ApproachAngle(Yaw, BeamYaw + 0.9f, 3.f * Dt);
	if (Def.Model == TEXT("wisp") && StateT < A.Windup)
	{
		FLBBurst B;
		B.Count = 1;
		B.Color = 0xffa040;
		B.Speed = 1.f;
		B.Life = 0.4f;
		G.Fx->Burst(Pos.X, Pos.Y + 1.5f, Pos.Z, B);
	}
	if (StateT >= A.Windup)
	{
		SetState(TEXT("active"));
		OnActiveStart();
	}
}

void FLBEnemy::OnActiveStart()
{
	const FLBEnemyAttack& A = *Attack;
	FLBPlayer& P = *G.Player;
	const float Damage = Dmg(A);
	const FString& K = A.Kind;
	const float AR = A.Radius > 0.f ? A.Radius : 3.f;
	auto Burst = [this](float X, float Y, float Z, int32 Count, int32 Color, float Speed, float Life, float Gravity, float UpBias) {
		FLBBurst B;
		B.Count = Count;
		B.Color = Color;
		B.Speed = Speed;
		B.Life = Life;
		B.Gravity = Gravity;
		B.Size = 1;
		B.UpBias = UpBias;
		G.Fx->Burst(X, Y, Z, B);
	};
	if (K == TEXT("melee"))
	{
		const float Dx = P.Pos.X - Pos.X;
		const float Dz = P.Pos.Z - Pos.Z;
		const float D = FMath::Sqrt(Dx * Dx + Dz * Dz);
		const bool bInArc = FMath::Abs(AngleDiff(Yaw, FMath::Atan2(Dx, Dz))) <= FMath::DegreesToRadians(A.Arc) / 2.f + (D < 1.5f ? 0.5f : 0.1f);
		if (D - P.Radius <= A.Range + Radius && bInArc) LandHit(Damage, A);
		G.Sfx(bBoss ? TEXT("swingHeavy") : TEXT("swing"), Pos.X, Pos.Z, 0.7f);
		if (bBoss)
		{
			const float Fx = Pos.X + FMath::Sin(Yaw) * A.Range * 0.8f;
			const float Fz = Pos.Z + FMath::Cos(Yaw) * A.Range * 0.8f;
			Burst(Fx, Pos.Y + 0.2f, Fz, 16, 0xc8a878, 5.f, 0.6f, 9.f, -1.f);
			G.Shake(0.3f);
		}
	}
	else if (K == TEXT("slam"))
	{
		if (Dist2(P.Pos, Pos) <= AR + P.Radius) LandHit(Damage, A);
		G.Fx->Shockwave(Pos.X, Pos.Y, Pos.Z, AR, 0xffa070);
		Burst(Pos.X, Pos.Y + 0.2f, Pos.Z, 26, 0xb8a888, 6.f, 0.7f, 10.f, 1.f);
		G.Shake(0.5f);
		G.Sfx(TEXT("explosion"), Pos.X, Pos.Z, 0.8f);
	}
	else if (K == TEXT("leap"))
	{
		LeapFrom = Pos;
	}
	else if (K == TEXT("pillars"))
	{
		const float PR = A.Radius > 0.f ? A.Radius : 2.f;
		const int32 Color = Def.Id == TEXT("kuroganemaru") ? 0xff7a3a : 0xb06aff;
		for (const FVector& Pp : PillarPos)
		{
			if (!bHitLanded && FMath::Sqrt(FMath::Square(P.Pos.X - Pp.X) + FMath::Square(P.Pos.Z - Pp.Z)) <= PR + P.Radius * 0.5f) LandHit(Damage, A);
			Burst(Pp.X, Pp.Y + 0.3f, Pp.Z, 22, Color, 7.f, 0.7f, 6.f, 2.f);
			G.Fx->Shockwave(Pp.X, Pp.Y, Pp.Z, PR, Color, 0.35f);
		}
		if (PillarPos.Num() > 0) G.Sfx(TEXT("explosion"), PillarPos[0].X, PillarPos[0].Z, 0.7f);
		G.Shake(0.25f);
	}
	else if (K == TEXT("projectile"))
	{
		const int32 N = FMath::Max(1, A.Count);
		const float Base = YawTo(Pos.X, Pos.Z, P.Pos.X, P.Pos.Z);
		const float Oy = Pos.Y + (Def.Flying ? 1.5f : ModelHeight() * 0.6f);
		const float Spread = A.Spread > 0.f ? A.Spread : 0.3f;
		for (int32 I = 0; I < N; I++)
		{
			const float Y = Base + (N > 1 ? (I - (N - 1) / 2.f) * (Spread / FMath::Max(1.f, (N - 1) / 2.f)) : 0.f);
			G.Projectiles->SpawnOrb(FVector(Pos.X, Oy, Pos.Z), Y, A.Speed > 0.f ? A.Speed : 10.f, Damage, A.StatusType, A.StatusTime, OrbColor(), Def.Id);
		}
		G.Sfx(TEXT("orb"), Pos.X, Pos.Z);
	}
	else if (K == TEXT("ring"))
	{
		G.Hazards->Ring(Pos, A.Radius > 0.f ? A.Radius : 12.f, A.Speed > 0.f ? A.Speed : 9.f, Damage, 0xff7a3a, Def.Id);
		G.Shake(0.4f);
		G.Sfx(TEXT("explosion"), Pos.X, Pos.Z);
	}
	else if (K == TEXT("beam"))
	{
		const float Len = A.Radius > 0.f ? A.Radius : 20.f;
		Beam = NewObject<UProceduralMeshComponent>(Actor);
		Beam->SetupAttachment(Actor->GetRootComponent());
		Beam->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Beam->SetCastShadow(false);
		Beam->RegisterComponent();
		Beam->SetUsingAbsoluteRotation(true);
		FLBMeshBuilder M;
		FLinearColor C = LB::Hex(0xc070ff) * 0.5f;
		C.A = 0.6f;
		M.Box(FVector(Len * 50.f, 0.f, 120.f), FVector(Len * 50.f, 80.f, 60.f), C);
		M.Build(Beam, 0, false, LBMaterials::Get(ELBMat::Additive));
		UpdateBeam();
	}
	else if (K == TEXT("summon"))
	{
		const int32 N = A.SummonCount;
		for (int32 I = 0; I < N; I++)
		{
			const float Ang = float(I) / N * UE_PI * 2.f + G.Rng.FRand();
			const float X = Pos.X + FMath::Cos(Ang) * 4.f;
			const float Z = Pos.Z + FMath::Sin(Ang) * 4.f;
			if (FLBEnemy* E = G.SpawnEnemy(A.SummonEnemy, X, Z, Level, true))
			{
				E->bAggro = true;
				E->State = TEXT("chase");
				Burst(X, G.Area->GroundY(X, Z) + 0.5f, Z, 20, 0x6a4a8a, 4.f, 0.7f, 0.f, -1.f);
			}
		}
	}
	else if (K == TEXT("teleport"))
	{
		const float Ang = G.Rng.FRand() * UE_PI * 2.f;
		const float R = bBoss ? 9.f : A.Range + 4.f;
		float Nx = P.Pos.X + FMath::Cos(Ang) * R;
		float Nz = P.Pos.Z + FMath::Sin(Ang) * R;
		if (G.Area && G.Area->Data && !G.Area->Data->IsWalkable(Nx, Nz))
		{
			Nx = Home.X;
			Nz = Home.Z;
		}
		Burst(Pos.X, Pos.Y + 1.f, Pos.Z, 20, 0x8a4aff, 4.f, 0.6f, 0.f, -1.f);
		Pos.X = Nx;
		Pos.Z = Nz;
		Burst(Nx, G.Area->GroundY(Nx, Nz) + 1.f, Nz, 20, 0x8a4aff, 4.f, 0.6f, 0.f, -1.f);
		Yaw = YawTo(Nx, Nz, P.Pos.X, P.Pos.Z);
	}
	else if (K == TEXT("dive"))
	{
		Pos.X = LeapTo.X;
		Pos.Z = LeapTo.Z;
		SetHidden(false);
		bTargetable = true;
		if (Dist2(P.Pos, Pos) <= AR + P.Radius) LandHit(Damage, A);
		G.Fx->Shockwave(Pos.X, LeapTo.Y, Pos.Z, AR, 0xb06aff);
		Burst(Pos.X, LeapTo.Y + 0.3f, Pos.Z, 30, 0x6a5a6a, 7.f, 0.8f, 9.f, 1.f);
		G.Shake(0.7f);
		G.Sfx(TEXT("explosion"), Pos.X, Pos.Z);
	}
}

int32 FLBEnemy::OrbColor() const
{
	if (Def.Id == TEXT("itomaru")) return 0xe8e0ff;
	if (Def.Model == TEXT("acolyte") || Def.Id == TEXT("yomikage")) return 0xb06aff;
	return 0xff8a2a;
}

void FLBEnemy::UpdateActive(float Dt)
{
	const FLBEnemyAttack& A = *Attack;
	FLBPlayer& P = *G.Player;
	const float Damage = Dmg(A);
	const FString& K = A.Kind;
	if (K == TEXT("charge"))
	{
		const float Sp = A.Speed > 0.f ? A.Speed : 10.f;
		MoveBy(FMath::Sin(Yaw) * Sp * Dt, FMath::Cos(Yaw) * Sp * Dt);
		MoveSpeedNow = Sp;
		if (!bHitLanded && Dist2(P.Pos, Pos) < Radius + P.Radius + 0.4f) LandHit(Damage, A);
		if (FMath::FloorToInt(StateT * 20.f) % 2 == 0)
		{
			FLBBurst B;
			B.Count = 2;
			B.Color = 0xa89878;
			B.Speed = 2.f;
			B.Life = 0.4f;
			B.Size = 1;
			G.Fx->Burst(Pos.X, Pos.Y + 0.2f, Pos.Z, B);
		}
	}
	else if (K == TEXT("leap"))
	{
		const float T = FMath::Clamp(StateT / FMath::Max(0.01f, A.Active), 0.f, 1.f);
		Pos.X = LeapFrom.X + (LeapTo.X - LeapFrom.X) * T;
		Pos.Z = LeapFrom.Z + (LeapTo.Z - LeapFrom.Z) * T;
		LeapHeight = FMath::Sin(T * UE_PI) * 4.f;
		if (T >= 1.f && !bHitLanded)
		{
			LeapHeight = 0.f;
			const float R = A.Radius > 0.f ? A.Radius : 3.f;
			const float Gy = G.Area->GroundY(Pos.X, Pos.Z);
			if (Dist2(P.Pos, Pos) <= R + P.Radius) LandHit(Damage, A);
			bHitLanded = true;
			G.Fx->Shockwave(Pos.X, Gy, Pos.Z, R, 0xffa070);
			FLBBurst B;
			B.Count = 26;
			B.Color = 0xb8a888;
			B.Speed = 6.f;
			B.Life = 0.7f;
			B.Gravity = 10.f;
			B.Size = 1;
			B.UpBias = 1.f;
			G.Fx->Burst(Pos.X, Gy + 0.2f, Pos.Z, B);
			G.Shake(bBoss ? 0.8f : 0.3f);
			G.Sfx(TEXT("explosion"), Pos.X, Pos.Z, bBoss ? 1.f : 0.5f);
		}
	}
	else if (K == TEXT("beam"))
	{
		BeamYaw += 1.8f / FMath::Max(0.01f, A.Active) * Dt;
		Yaw = BeamYaw;
		UpdateBeam();
		Tick -= Dt;
		if (Tick <= 0.f)
		{
			Tick = A.Interval > 0.f ? A.Interval : 0.25f;
			const float Dx = P.Pos.X - Pos.X;
			const float Dz = P.Pos.Z - Pos.Z;
			const float Fx = FMath::Sin(BeamYaw);
			const float Fz = FMath::Cos(BeamYaw);
			const float Along = Dx * Fx + Dz * Fz;
			const float Perp = FMath::Abs(Dx * Fz - Dz * Fx);
			if (Along > 0.f && Along < (A.Radius > 0.f ? A.Radius : 20.f) && Perp < 1.2f + P.Radius)
			{
				bHitLanded = false;
				LandHit(Damage, A);
			}
		}
	}
	else if (K == TEXT("spiral"))
	{
		Tick -= Dt;
		if (Tick <= 0.f)
		{
			Tick = A.Interval > 0.f ? A.Interval : 0.15f;
			const int32 N = FMath::Max(1, A.Count > 1 ? A.Count : 3);
			const float Oy = Pos.Y + (Def.Flying ? 2.5f : 1.2f);
			for (int32 I = 0; I < N; I++)
			{
				G.Projectiles->SpawnOrb(FVector(Pos.X, Oy, Pos.Z), SpiralAngle + float(I) / N * UE_PI * 2.f, A.Speed > 0.f ? A.Speed : 9.f, Damage, A.StatusType, A.StatusTime, OrbColor(), Def.Id);
			}
			SpiralAngle += 0.33f;
		}
	}
	if (StateT >= A.Active)
	{
		LeapHeight = 0.f;
		RemoveBeam();
		SetState(TEXT("recover"));
	}
}

void FLBEnemy::LandHit(float Damage, const FLBEnemyAttack& A)
{
	if (bHitLanded) return;
	FLBEnemyHit H;
	H.Damage = Damage;
	H.FromX = Pos.X;
	H.FromZ = Pos.Z;
	H.Knockback = bBoss ? 2.5f : 1.2f;
	H.StatusType = A.StatusType;
	H.StatusTime = A.StatusTime;
	H.Source = Def.Name;
	if (G.HitPlayer(H)) bHitLanded = true;
}

void FLBEnemy::UpdateBeam()
{
	if (!Beam) return;
	Beam->SetWorldRotation(FRotator(0.f, LB::YawToUE(BeamYaw), 0.f));
	const float S = 0.8f + FMath::Sin(AnimT * 30.f) * 0.2f;
	Beam->SetRelativeScale3D(FVector(1.f, S, 1.f));
}

void FLBEnemy::RemoveBeam()
{
	if (IsValid(Beam)) Beam->DestroyComponent();
	Beam = nullptr;
}

void FLBEnemy::FinishAttack()
{
	if (Attack) Cooldowns.Add(Attack->Id, Attack->Cooldown);
	Attack = nullptr;
	GlobalCd = bBoss ? 0.25f + G.Rng.FRand() * 0.5f : 0.5f + G.Rng.FRand() * 0.7f;
	SetState(TEXT("chase"));
}

void FLBEnemy::CancelAttack()
{
	if (IsValid(G.Fx) && !(G.World && G.World->bIsTearingDown))
	{
		for (const int32 H : Telegraphs) G.Fx->RemoveTelegraph(H);
	}
	Telegraphs.Reset();
	RemoveBeam();
	if (Attack) Cooldowns.Add(Attack->Id, Attack->Cooldown * 0.5f);
	Attack = nullptr;
	LeapHeight = 0.f;
	if (bHidden || !bTargetable)
	{
		SetHidden(false);
		bTargetable = true;
	}
	bHasToken = false;
}

void FLBEnemy::SetState(const TCHAR* S)
{
	const FString NewState(S);
	if (NewState != TEXT("windup") && NewState != TEXT("active")) Telegraphs.Reset(); // the effects actor expires them
	// Attack tokens are held only from wind-up through recovery.
	if (NewState == TEXT("chase") || NewState == TEXT("idle") || NewState == TEXT("return") || NewState == TEXT("stagger") || NewState == TEXT("hit")) bHasToken = false;
	State = NewState;
	StateT = 0.f;
}

// =================================================================== Movement

void FLBEnemy::MoveBy(float Dx, float Dz)
{
	const FVector2D R = G.Area ? G.Area->Move(Pos.X, Pos.Z, Dx, Dz, Radius) : FVector2D(Pos.X + Dx, Pos.Z + Dz);
	Pos.X = R.X;
	Pos.Z = R.Y;
}

void FLBEnemy::MoveDir(float InYaw, float Speed, float Dt)
{
	MoveBy(FMath::Sin(InYaw) * Speed * Dt, FMath::Cos(InYaw) * Speed * Dt);
	MoveSpeedNow = Speed;
}

void FLBEnemy::MoveToward(float X, float Z, float Speed, float Dt)
{
	const float Y = YawTo(Pos.X, Pos.Z, X, Z);
	Yaw = ApproachAngle(Yaw, Y, 8.f * Dt);
	MoveDir(Y, Speed, Dt);
}

void FLBEnemy::AlertAllies()
{
	for (const TUniquePtr<FLBEnemy>& E : G.Enemies)
	{
		if (E.Get() != this && E->Alive() && !E->bAggro && E->Def.Behavior != TEXT("dummy") && FVector::Dist(E->Pos, Pos) < 10.f) E->bAggro = true;
	}
}

// =================================================================== Damage

void FLBEnemy::ReceiveHit(float Amount, const FLBHitInfo& Hit)
{
	if (!Alive()) return;
	Hp -= Amount;
	FlashT = 0.1f;
	Rig.Flash();
	if (!bAggro && Def.Behavior != TEXT("dummy"))
	{
		bAggro = true;
		AlertAllies();
		if (State == TEXT("idle") || State == TEXT("return")) SetState(TEXT("chase"));
	}
	const float Dx = Pos.X - Hit.FromX;
	const float Dz = Pos.Z - Hit.FromZ;
	float D = FMath::Sqrt(Dx * Dx + Dz * Dz);
	if (D <= 0.f) D = 1.f;
	const float KbScale = bBoss ? 0.1f : Def.SuperArmor ? 0.3f : 1.f;
	if (Def.Behavior != TEXT("dummy"))
	{
		Vel.X += Dx / D * Hit.Knockback * 2.2f * KbScale;
		Vel.Z += Dz / D * Hit.Knockback * 2.2f * KbScale;
	}
	const FLBStats& S = G.Stats();
	if (Hit.Bleed > 0.f && G.Rng.FRand() < Hit.Bleed)
	{
		BleedT = 4.f;
		BleedDps = FMath::Max(1.f, S.Atk * 0.25f);
	}
	if (S.BurnChance > 0.f && G.Rng.FRand() < S.BurnChance)
	{
		BurnT = 3.f;
		BurnDps = FMath::Max(1.f, S.Atk * 0.3f);
	}
	if (Hp <= 0.f) return;

	if (bBoss) CheckPhase();
	if (State == TEXT("phase") || State == TEXT("intro")) return;

	if (Hit.Stun > 0.f)
	{
		CancelAttack();
		StunT = bBoss ? Hit.Stun * 0.4f : Hit.Stun;
		SetState(TEXT("stagger"));
		return;
	}
	// Poise: enough poise damage in a short window causes a stagger. Enemies keep
	// winding up through light hits, so they cannot be stun-locked.
	PoiseRegenT = 2.5f;
	if (StaggerImmuneT <= 0.f) Poise -= Hit.Poise;
	if (Poise <= 0.f)
	{
		Poise = Def.Poise;
		CancelAttack();
		SetState(TEXT("stagger"));
		G.Sfx(TEXT("stagger"), Pos.X, Pos.Z);
		FLBBurst B;
		B.Count = 14;
		B.Color = 0xffe08a;
		B.Speed = 3.f;
		B.Life = 0.6f;
		B.Size = 1;
		G.Fx->Burst(Pos.X, Pos.Y + ModelHeight() * 0.8f, Pos.Z, B);
		return;
	}
	// Brief flinch when caught off guard (not while winding up or striking).
	if (!bBoss && !Def.SuperArmor && FlinchCd <= 0.f && (State == TEXT("chase") || State == TEXT("strafe") || State == TEXT("recover") || State == TEXT("idle")))
	{
		FlinchCd = 1.4f;
		SetState(TEXT("hit"));
	}
}

void FLBEnemy::CheckPhase()
{
	const TArray<float>& Th = Def.PhaseThresholds;
	const float Frac = Hp / FMath::Max(1.f, MaxHp);
	if (Phase - 1 < Th.Num() && Frac <= Th[Phase - 1])
	{
		Phase++;
		CancelAttack();
		bInvulnerable = true;
		SetState(TEXT("phase"));
		// One line per phase transition (the last line repeats if there are more phases than lines).
		if (const FLBBossLines* Lines = G.D->BossLines.Find(Def.Id))
		{
			if (Lines->Phase.Num() > 0) G.Caption(Lines->Phase[FMath::Min(Phase - 2, Lines->Phase.Num() - 1)], Def.Name, 2.8f);
		}
		G.Sfx(TEXT("bossRoar"), Pos.X, Pos.Z);
		G.Fx->Shockwave(Pos.X, Pos.Y, Pos.Z, 8.f, 0xff5a3a, 0.7f);
		G.Shake(0.6f);
		// Push the player away so the next phase starts fair.
		FLBPlayer& P = *G.Player;
		const float Dx = P.Pos.X - Pos.X;
		const float Dz = P.Pos.Z - Pos.Z;
		float D = FMath::Sqrt(Dx * Dx + Dz * Dz);
		if (D <= 0.f) D = 1.f;
		if (D < 7.f) P.Vel = FVector(Dx / D * 14.f, 0.f, Dz / D * 14.f);
	}
}

void FLBEnemy::Die()
{
	CancelAttack();
	State = TEXT("dead");
	StateT = 0.f;
	DeadT = 0.f;
	bTargetable = false;
	SetHidden(false);
}

void FLBEnemy::StartIntro()
{
	bDormant = false;
	SetState(TEXT("intro"));
	bAggro = true;
}

void FLBEnemy::UpdateDots(float Dt)
{
	if (!Alive() || (BleedT <= 0.f && BurnT <= 0.f)) return;
	BleedT -= Dt;
	BurnT -= Dt;
	DotTick -= Dt;
	if (DotTick <= 0.f)
	{
		DotTick = 0.5f;
		float Amount = 0.f;
		if (BleedT > 0.f) Amount += BleedDps * 0.5f;
		if (BurnT > 0.f) Amount += BurnDps * 0.5f;
		FLBHitInfo H;
		H.Mult = 0.f;
		H.FromX = Pos.X;
		H.FromZ = Pos.Z;
		H.bNoHitstop = true;
		H.Source = TEXT("dot");
		H.FixedDamage = FMath::Max(1, FMath::RoundToInt(Amount));
		const bool bBleeding = BleedT > 0.f;
		const FVector At = Pos;
		G.HitEnemy(*this, H);
		FLBBurst B;
		B.Count = 4;
		B.Color = bBleeding ? 0xc02040 : 0xff7a2a;
		B.Speed = 1.5f;
		B.Life = 0.5f;
		B.Gravity = 3.f;
		G.Fx->Burst(At.X, At.Y + 1.f, At.Z, B);
	}
}

// =================================================================== Animation

FString FLBEnemy::PoseFor(const FLBEnemyAttack& A) const
{
	const FString& K = A.Kind;
	if (K == TEXT("projectile") || K == TEXT("pillars") || K == TEXT("summon") || K == TEXT("teleport") || K == TEXT("spiral") || K == TEXT("beam") || K == TEXT("ring")) return TEXT("cast");
	if (Def.Model == TEXT("oni") || Def.Model == TEXT("sentinel")) return A.Id == TEXT("sweep") ? TEXT("slashR") : TEXT("smash");
	if (K == TEXT("slam")) return TEXT("smash");
	if (K == TEXT("charge")) return TEXT("thrust");
	return TEXT("claw");
}

void FLBEnemy::Animate(float Dt, float Speed)
{
	FString AnimMode = TEXT("idle");
	float Progress = 0.f;
	if (State == TEXT("chase") || State == TEXT("strafe") || State == TEXT("return") || State == TEXT("idle")) AnimMode = Speed > 0.2f ? TEXT("move") : TEXT("idle");
	else if (State == TEXT("windup"))
	{
		AnimMode = TEXT("windup");
		Progress = Attack ? FMath::Clamp(StateT / FMath::Max(0.01f, Attack->Windup), 0.f, 1.f) : 0.f;
	}
	else if (State == TEXT("active")) AnimMode = Attack && Attack->Kind == TEXT("charge") ? TEXT("move") : TEXT("active");
	else if (State == TEXT("recover")) AnimMode = TEXT("recover");
	else if (State == TEXT("hit")) AnimMode = TEXT("hit");
	else if (State == TEXT("stagger")) AnimMode = TEXT("stagger");
	else if (State == TEXT("intro") || State == TEXT("phase"))
	{
		AnimMode = TEXT("windup");
		Progress = 0.5f;
	}
	const FString Pose = Attack ? PoseFor(*Attack) : FString();
	Rig.Animate(AnimMode, Pose, AnimT, AnimMode == TEXT("move") ? FMath::Max(Speed, 2.f) : Speed, Progress, Dt);

	// Readability: a red pulse just before the strike lands, gold while staggered.
	if (Glow)
	{
		const bool bReduce = G.Settings().bReduceFlashing;
		if (FlashT > 0.f)
		{
			FlashT -= Dt;
			Glow->SetLightColor(FLinearColor::White);
			Glow->SetIntensity(bReduce ? 3.f : 12.f);
		}
		else if (State == TEXT("windup") && Attack && StateT > Attack->Windup * 0.6f && FMath::FloorToInt(AnimT * 16.f) % 2 == 0)
		{
			Glow->SetLightColor(LB::Hex(G.Settings().bHighContrastTelegraphs ? 0xff00c8 : 0xff3020));
			Glow->SetIntensity(bReduce ? 8.f : 30.f);
		}
		else if (State == TEXT("stagger"))
		{
			Glow->SetLightColor(LB::Hex(0xffe08a));
			Glow->SetIntensity(6.f + FMath::Sin(AnimT * 12.f) * 4.f);
		}
		else Glow->SetIntensity(0.f);
	}
}

void FLBEnemy::Dispose()
{
	CancelAttack();
	RemoveBeam();
	LBSafeDestroy(Actor);
	Actor = nullptr;
	Glow = nullptr;
}
