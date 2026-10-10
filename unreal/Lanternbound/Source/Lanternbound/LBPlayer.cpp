// The Lantern Warden (port of src/entities/player.ts).

#include "LBEntities.h"
#include "LBGame.h"
#include "LBArea.h"
#include "LBFx.h"
#include "LBData.h"
#include "LBMath.h"
#include "LBVisual.h"
#include "LBPlayerController.h"
#include "Components/PointLightComponent.h"
#include "ProceduralMeshComponent.h"

using namespace LBMathG;

namespace
{
	constexpr float BaseSpeed = 6.2f;
	constexpr float SprintMult = 1.5f;
	constexpr float DodgeTime = 0.42f;
	constexpr float DodgeCost = 22.f;
	constexpr float IframeStart = 0.03f;
	constexpr float IframeEnd = 0.34f;

	int32 TrailColorFor(const FString& Type)
	{
		if (Type == TEXT("naginata")) return 0x9affd8;
		if (Type == TEXT("tanto")) return 0xd8a0ff;
		if (Type == TEXT("kanabo")) return 0xffb070;
		if (Type == TEXT("bow")) return 0xffe08a;
		return 0xbfe6ff;
	}
}

FLBPlayer::FLBPlayer(FLBGame& InG) : G(InG)
{
	Actor = G.SpawnVisual();
	if (Actor)
	{
		Rig = LBRigBuilder::Player(Actor, Actor->GetRootComponent(), G.Mat);
		Lantern = Actor->AddLight(FVector(0.f, -30.f, 110.f), 0xffb060, 4.f, 1200.f);
		FlashLight = Actor->AddLight(FVector(0.f, 0.f, 120.f), 0xff4040, 0.f, 400.f);
	}
	for (const TCHAR* T : {TEXT("katana"), TEXT("naginata"), TEXT("tanto"), TEXT("kanabo"), TEXT("bow")}) AbilityCd.Add(T, 0.f);
}

FLBPlayer::~FLBPlayer()
{
	LBSafeDestroy(Actor);
}

void FLBPlayer::SetLanternIntensity(float I)
{
	if (Lantern) Lantern->SetIntensity(I * 3.f);
}

void FLBPlayer::SetVisible(bool bVisible)
{
	if (Actor) Actor->SetActorHiddenInGame(!bVisible);
}

bool FLBPlayer::Invulnerable() const
{
	if (InvulnT > 0.f) return true;
	if (State == TEXT("dodge")) return StateT >= IframeStart && StateT <= IframeEnd;
	if (State == TEXT("ability") && (AbilityKind == TEXT("iaiDash") || AbilityKind == TEXT("shadowStep"))) return true;
	return false;
}

void FLBPlayer::EquipWeapon()
{
	const FLBItemInstance* Inst = FLBRules::ActiveWeapon(G.Data);
	const FLBItemDef* Def = Inst ? G.D->Item(Inst->Id) : nullptr;
	WeaponType = Def && !Def->WeaponType.IsEmpty() ? Def->WeaponType : FString(TEXT("katana"));
	Family = G.D->Weapons.Find(WeaponType);
	if (!Family) Family = G.D->Weapons.Find(TEXT("katana"));
	if (WeaponMesh) WeaponMesh->DestroyComponent();
	if (OffhandMesh) OffhandMesh->DestroyComponent();
	WeaponMesh = OffhandMesh = nullptr;
	if (Actor && Rig.HandR)
	{
		const int32 Rarity = Inst ? Inst->Rarity : 0;
		WeaponMesh = LBRigBuilder::Weapon(Actor, Rig.HandR, WeaponType, Rarity, G.Mat, false);
		if (WeaponType == TEXT("bow") && Rig.HandL) OffhandMesh = LBRigBuilder::Weapon(Actor, Rig.HandL, WeaponType, Rarity, G.Mat, true);
	}
	BladeLength = WeaponType == TEXT("naginata") ? 191.f : WeaponType == TEXT("tanto") ? 44.f : WeaponType == TEXT("kanabo") ? 110.f : 103.f;
	if (G.Fx) G.Fx->SetTrailColor(TrailColorFor(WeaponType));
	ComboIndex = 0;
}

void FLBPlayer::Place(float X, float Y, float Z, float InYaw)
{
	Pos = FVector(X, Y, Z);
	Yaw = InYaw;
	Vel = FVector::ZeroVector;
	if (Actor) Actor->Place(X, Y, Z, Yaw);
}

void FLBPlayer::ResetCombatState()
{
	State = TEXT("normal");
	StateT = 0.f;
	Attack = nullptr;
	AbilityKind.Empty();
	Buffered.Empty();
	if (G.Fx) G.Fx->bTrailActive = false;
	BurnT = SlowT = 0.f;
	LockTarget = nullptr;
	SpinYaw = 0.f;
	JumpH = 0.f;
	if (Rig.Spinner)
	{
		Rig.Spinner->SetRelativeRotation(FRotator::ZeroRotator);
		Rig.Spinner->SetRelativeLocation(FVector(0, 0, 55));
	}
	SetVisible(true);
}

// =================================================================== Update

void FLBPlayer::Update(float Dt, const FLBInputFrame& In, float CamYaw)
{
	const FLBStats& S = G.Stats();
	StateT += Dt;
	InvulnT = FMath::Max(0.f, InvulnT - Dt);
	SwapT = FMath::Max(0.f, SwapT - Dt);
	ParryT = FMath::Max(0.f, ParryT - Dt);
	for (TPair<FString, float>& P : AbilityCd) P.Value = FMath::Max(0.f, P.Value - Dt);
	if (BuffT > 0.f)
	{
		BuffT -= Dt;
		if (BuffT <= 0.f) BuffAtk = 0.f;
	}
	if (!Buffered.IsEmpty())
	{
		BufferedT -= Dt;
		if (BufferedT <= 0.f) Buffered.Empty();
	}
	ComboResetT -= Dt;
	if (ComboResetT <= 0.f && State != TEXT("attack")) ComboIndex = 0;
	if (LockTarget && (!LockTarget->Alive() || FVector::Dist(LockTarget->Pos, Pos) > 30.f)) LockTarget = nullptr;

	// Status effects
	if (BurnT > 0.f && Alive())
	{
		BurnT -= Dt;
		BurnTick -= Dt;
		if (BurnTick <= 0.f)
		{
			BurnTick = 0.5f;
			const float Dmg = FMath::Max(1.f, FMath::RoundToFloat(S.MaxHp * 0.012f));
			Hp = FMath::Max(1.f, Hp - Dmg);
			if (G.Fx)
			{
				G.Fx->FloatText(Pos.X, Pos.Y + 2.f, Pos.Z, FString::FromInt(int32(Dmg)), FLinearColor(1.f, 0.6f, 0.35f), 0.6f, 0.8f);
				FLBBurst B;
				B.Count = 4;
				B.Color = 0xff7a2a;
				B.Speed = 1.5f;
				B.Life = 0.5f;
				B.Gravity = -2.f;
				G.Fx->Burst(Pos.X, Pos.Y + 1.f, Pos.Z, B);
			}
		}
	}
	SlowT = FMath::Max(0.f, SlowT - Dt);

	// Stamina
	StaminaDelay -= Dt;
	const bool bSprinting = In.IsDown(ELBAction::Sprint) && State == TEXT("normal") && (FMath::Abs(In.MoveX) + FMath::Abs(In.MoveY) > 0.1f);
	if (bSprinting && Stamina > 0.f)
	{
		Stamina = FMath::Max(0.f, Stamina - 16.f * Dt);
		StaminaDelay = 0.5f;
	}
	else if (StaminaDelay <= 0.f && State != TEXT("dodge"))
	{
		Stamina = FMath::Min(S.MaxStamina, Stamina + 38.f * (1.f + S.StaminaRegen) * Dt);
	}

	// Movement intent relative to the camera.
	const float Fx = FMath::Sin(CamYaw), Fz = FMath::Cos(CamYaw);
	const float Rx = -FMath::Cos(CamYaw), Rz = FMath::Sin(CamYaw);
	float Mx = Fx * In.MoveY + Rx * In.MoveX;
	float Mz = Fz * In.MoveY + Rz * In.MoveX;
	const float Mlen = FMath::Sqrt(Mx * Mx + Mz * Mz);
	if (Mlen > 1.f)
	{
		Mx /= Mlen;
		Mz /= Mlen;
	}
	MoveIntent = FVector2D(Mx, Mz);

	if (State == TEXT("frozen") || State == TEXT("dead"))
	{
		Animate(Dt, 0.f);
		ApplyKnockback(Dt);
		SyncTransform();
		return;
	}

	// Input buffering
	if (In.WasPressed(ELBAction::Attack)) { Buffered = TEXT("attack"); BufferedT = 0.35f; }
	if (In.WasPressed(ELBAction::Heavy)) { Buffered = TEXT("heavy"); BufferedT = 0.35f; }
	if (In.WasPressed(ELBAction::Dodge)) { Buffered = TEXT("dodge"); BufferedT = 0.25f; }
	if (In.WasPressed(ELBAction::Ability)) { Buffered = TEXT("ability"); BufferedT = 0.25f; }

	if (In.WasPressed(ELBAction::SwapWeapon))
	{
		// Swapping is allowed while idle/moving or to cancel an attack's recovery.
		if (State == TEXT("attack") && Attack && StateT >= Attack->Windup + Attack->Active)
		{
			State = TEXT("normal");
			Attack = nullptr;
			G.Fx->bTrailActive = false;
		}
		if (State == TEXT("normal")) TrySwap();
	}
	if (In.WasPressed(ELBAction::Heal) && State == TEXT("normal")) TryHeal();

	float Speed = 0.f;
	if (State == TEXT("normal"))
	{
		if (!ConsumeBuffered())
		{
			const float Slow = (SlowT > 0.f ? 0.6f : 1.f) * (bInWater ? 0.72f : 1.f);
			const float Target = BaseSpeed * (Family ? Family->MoveSpeed : 1.f) * (1.f + S.MoveSpeed) * Slow * (bSprinting && Stamina > 0.f ? SprintMult : 1.f) * FMath::Min(1.f, Mlen);
			MoveSpeed += (Target - MoveSpeed) * Damp(14.f, Dt);
			if (Mlen > 0.05f)
			{
				const float Desired = FMath::Atan2(Mx, Mz);
				const bool bLockFace = LockTarget && !bSprinting;
				const float FaceYaw = bLockFace ? YawTo(Pos.X, Pos.Z, LockTarget->Pos.X, LockTarget->Pos.Z) : Desired;
				Yaw = ApproachAngle(Yaw, FaceYaw, 14.f * Dt);
				MoveBy(FMath::Sin(Desired) * MoveSpeed * Dt, FMath::Cos(Desired) * MoveSpeed * Dt);
				Speed = MoveSpeed;
			}
			else
			{
				MoveSpeed = 0.f;
				if (LockTarget) Yaw = ApproachAngle(Yaw, YawTo(Pos.X, Pos.Z, LockTarget->Pos.X, LockTarget->Pos.Z), 10.f * Dt);
			}
		}
	}
	else if (State == TEXT("attack"))
	{
		UpdateAttack(Dt);
	}
	else if (State == TEXT("dodge"))
	{
		const float P = StateT / DodgeTime;
		const float Sp = 13.f * (1.f - P) + 3.f;
		MoveBy(DodgeDirX * Sp * Dt, DodgeDirZ * Sp * Dt);
		Speed = Sp;
		if (StateT >= DodgeTime)
		{
			State = TEXT("normal");
			StateT = 0.f;
		}
		else if (StateT > 0.3f && !Buffered.IsEmpty() && Buffered != TEXT("dodge"))
		{
			State = TEXT("normal");
			ConsumeBuffered();
		}
	}
	else if (State == TEXT("hit"))
	{
		if (StateT >= 0.32f)
		{
			State = TEXT("normal");
			StateT = 0.f;
		}
		else if (StateT > 0.18f && Buffered == TEXT("dodge"))
		{
			State = TEXT("normal");
			ConsumeBuffered();
		}
	}
	else if (State == TEXT("heal"))
	{
		const float Dur = FLBRules::HasSpecial(*G.D, G.Data, TEXT("teaMastery")) ? 0.45f : 0.9f;
		const float Mv = BaseSpeed * 0.4f * FMath::Min(1.f, Mlen);
		if (Mlen > 0.05f)
		{
			const float Desired = FMath::Atan2(Mx, Mz);
			Yaw = ApproachAngle(Yaw, Desired, 8.f * Dt);
			MoveBy(FMath::Sin(Desired) * Mv * Dt, FMath::Cos(Desired) * Mv * Dt);
			Speed = Mv;
		}
		if (!bHealApplied && StateT >= Dur * 0.6f) ApplyHeal();
		if (StateT >= Dur)
		{
			State = TEXT("normal");
			StateT = 0.f;
		}
	}
	else if (State == TEXT("ability"))
	{
		Speed = UpdateAbility(Dt, Mx, Mz, Mlen);
	}

	// Footsteps
	if (Speed > 1.f && State == TEXT("normal"))
	{
		StepT -= Dt * Speed;
		if (StepT <= 0.f)
		{
			StepT = 2.2f;
			G.Sfx(bInWater ? TEXT("splash") : TEXT("step"), Pos.X, Pos.Z, bInWater ? 0.5f : 0.6f);
			if (bInWater && G.Fx)
			{
				FLBBurst B;
				B.Count = 4;
				B.Color = 0xbfe8ff;
				B.Speed = 2.f;
				B.Life = 0.4f;
				B.Gravity = 8.f;
				B.UpBias = 1.5f;
				G.Fx->Burst(Pos.X, Pos.Y + 0.1f, Pos.Z, B);
			}
		}
	}

	ApplyKnockback(Dt);
	Animate(Dt, Speed);
	SyncTransform();
	UpdateTrail();
}

void FLBPlayer::ApplyKnockback(float Dt)
{
	if (Vel.SizeSquared() > 0.0001f)
	{
		MoveBy(Vel.X * Dt, Vel.Z * Dt);
		Vel *= FMath::Exp(-8.f * Dt);
	}
}

void FLBPlayer::SyncTransform()
{
	if (G.Area)
	{
		Pos.Y = G.Area->GroundY(Pos.X, Pos.Z);
		bInWater = G.Area->InWater(Pos.X, Pos.Z);
	}
	if (Actor) Actor->Place(Pos.X, Pos.Y, Pos.Z, Yaw + SpinYaw);
}

void FLBPlayer::MoveBy(float Dx, float Dz)
{
	if (!G.Area)
	{
		Pos.X += Dx;
		Pos.Z += Dz;
		return;
	}
	const FVector2D R = G.Area->Move(Pos.X, Pos.Z, Dx, Dz, Radius);
	Pos.X = R.X;
	Pos.Z = R.Y;
}

// =================================================================== Actions

bool FLBPlayer::ConsumeBuffered()
{
	if (Buffered.IsEmpty() || !Family) return false;
	const FString B = Buffered;
	if (B == TEXT("dodge"))
	{
		Buffered.Empty();
		return TryDodge();
	}
	if (B == TEXT("ability"))
	{
		Buffered.Empty();
		return TryAbility();
	}
	const bool bHeavy = B == TEXT("heavy");
	if (!bHeavy && Family->Light.Num() == 0) return false;
	const FLBAttackDef& Def = bHeavy ? Family->Heavy : Family->Light[ComboIndex % Family->Light.Num()];
	Buffered.Empty();
	if (Stamina < Def.Stamina * 0.5f)
	{
		G.SfxUI(TEXT("uiError"), 0.4f);
		return false;
	}
	StartAttack(Def, bHeavy);
	return true;
}

bool FLBPlayer::TryDodge()
{
	const int32* Fleet = G.Data.Skills.Find(TEXT("fleet"));
	const float Cost = DodgeCost * (1.f - 0.08f * (Fleet ? *Fleet : 0));
	if (Stamina < Cost * 0.6f)
	{
		G.SfxUI(TEXT("uiError"), 0.4f);
		return false;
	}
	Stamina = FMath::Max(0.f, Stamina - Cost);
	StaminaDelay = 0.6f;
	const float Ml = MoveIntent.Size();
	if (Ml > 0.1f)
	{
		DodgeDirX = MoveIntent.X / Ml;
		DodgeDirZ = MoveIntent.Y / Ml;
		Yaw = FMath::Atan2(DodgeDirX, DodgeDirZ);
	}
	else
	{
		// Backstep when no direction is held.
		DodgeDirX = -FMath::Sin(Yaw);
		DodgeDirZ = -FMath::Cos(Yaw);
	}
	State = TEXT("dodge");
	StateT = 0.f;
	Attack = nullptr;
	G.Fx->bTrailActive = false;
	DodgeStartTime = G.Time;
	G.Sfx(TEXT("dodge"), Pos.X, Pos.Z);
	FLBBurst B;
	B.Count = 8;
	B.Color = 0xd8c8b0;
	B.Speed = 2.f;
	B.Life = 0.5f;
	B.Gravity = 1.f;
	B.Size = 1;
	G.Fx->Burst(Pos.X, Pos.Y + 0.2f, Pos.Z, B);
	G.QuestEvent(TEXT("tut_dodge"));
	return true;
}

float FLBPlayer::AimYaw(float MaxDist)
{
	if (LockTarget) return YawTo(Pos.X, Pos.Z, LockTarget->Pos.X, LockTarget->Pos.Z);
	const float Ml = MoveIntent.Size();
	const float InputYaw = Ml > 0.2f ? FMath::Atan2(MoveIntent.X, MoveIntent.Y) : Yaw;
	if (G.Settings().bAutoFaceTarget)
	{
		FLBEnemy* Best = nullptr;
		float BestScore = TNumericLimits<float>::Max();
		for (const TUniquePtr<FLBEnemy>& E : G.Enemies)
		{
			if (!E->Alive() || !E->bTargetable) continue;
			const float D = Dist2(E->Pos, Pos) - E->Radius;
			if (D > MaxDist) continue;
			const float A = FMath::Abs(AngleDiff(InputYaw, YawTo(Pos.X, Pos.Z, E->Pos.X, E->Pos.Z)));
			if (A > 1.9f) continue;
			const float Score = D + A * 2.f;
			if (Score < BestScore)
			{
				BestScore = Score;
				Best = E.Get();
			}
		}
		if (Best) return YawTo(Pos.X, Pos.Z, Best->Pos.X, Best->Pos.Z);
	}
	return InputYaw;
}

void FLBPlayer::StartAttack(const FLBAttackDef& Def, bool bHeavy)
{
	Attack = &Def;
	bAttackIsHeavy = bHeavy;
	State = TEXT("attack");
	StateT = 0.f;
	AttackHit.Reset();
	bFiredProjectile = false;
	Stamina = FMath::Max(0.f, Stamina - Def.Stamina);
	StaminaDelay = 0.5f;
	Yaw = AimYaw(Def.Kind == TEXT("projectile") ? 28.f : 4.5f);
	if (!bHeavy) ComboIndex = (ComboIndex + 1) % FMath::Max(1, Family->Light.Num());
	else ComboIndex = 0;
	ComboResetT = Def.Total() + 0.5f;
	if (Def.Kind == TEXT("melee")) G.Sfx(bHeavy || Def.Damage > 2.f ? TEXT("swingHeavy") : TEXT("swing"), Pos.X, Pos.Z, 0.8f);
}

void FLBPlayer::UpdateAttack(float Dt)
{
	const FLBAttackDef& A = *Attack;
	const float T = StateT;
	const float ActiveStart = A.Windup;
	const float ActiveEnd = A.Windup + A.Active;
	const float Total = A.Total();
	// Lunge during the end of the wind-up and the active window.
	const float LungeStart = A.Windup * 0.5f;
	if (T >= LungeStart && T <= ActiveEnd && A.Lunge != 0.f)
	{
		const float LungeDur = FMath::Max(0.01f, ActiveEnd - LungeStart);
		float StepLen = A.Lunge / LungeDur * Dt;
		// Don't push through a locked target.
		if (LockTarget && StepLen > 0.f)
		{
			const float D = Dist2(LockTarget->Pos, Pos) - LockTarget->Radius - Radius;
			StepLen = FMath::Min(StepLen, FMath::Max(0.f, D - 0.3f));
		}
		MoveBy(FMath::Sin(Yaw) * StepLen, FMath::Cos(Yaw) * StepLen);
	}
	// Slight aim correction during wind-up.
	if (T < ActiveStart && LockTarget) Yaw = ApproachAngle(Yaw, YawTo(Pos.X, Pos.Z, LockTarget->Pos.X, LockTarget->Pos.Z), 8.f * Dt);
	if (A.Kind == TEXT("melee"))
	{
		G.Fx->bTrailActive = T >= ActiveStart - 0.03f && T <= ActiveEnd + 0.04f;
		if (T >= ActiveStart && T <= ActiveEnd) MeleeHits(A);
		if (A.ShockwaveRadius > 0.f && T >= ActiveEnd && !bFiredProjectile)
		{
			bFiredProjectile = true;
			const float Fx = Pos.X + FMath::Sin(Yaw) * 1.8f;
			const float Fz = Pos.Z + FMath::Cos(Yaw) * 1.8f;
			G.Fx->Shockwave(Fx, Pos.Y, Fz, A.ShockwaveRadius, 0xffc070);
			FLBBurst B;
			B.Count = 20;
			B.Color = 0xc8a878;
			B.Speed = 5.f;
			B.Life = 0.6f;
			B.Gravity = 9.f;
			B.Size = 1;
			B.UpBias = 1.f;
			G.Fx->Burst(Fx, Pos.Y + 0.2f, Fz, B);
			G.Shake(0.35f);
			G.Sfx(TEXT("explosion"), Fx, Fz, 0.6f);
			TArray<FLBEnemy*> Targets;
			for (const TUniquePtr<FLBEnemy>& E : G.Enemies) Targets.Add(E.Get());
			for (FLBEnemy* E : Targets)
			{
				if (!E->Alive() || !E->bTargetable) continue;
				if (FMath::Sqrt(FMath::Square(E->Pos.X - Fx) + FMath::Square(E->Pos.Z - Fz)) <= A.ShockwaveRadius + E->Radius)
				{
					FLBHitInfo H;
					H.Mult = A.ShockwaveDamage;
					H.Poise = A.Poise * 0.5f;
					H.Knockback = A.Knockback;
					H.FromX = Fx;
					H.FromZ = Fz;
					H.bNoHitstop = true;
					H.bHeavy = true;
					G.HitEnemy(*E, H);
				}
			}
		}
	}
	else if (A.Kind == TEXT("projectile") && T >= ActiveStart && !bFiredProjectile)
	{
		bFiredProjectile = true;
		FireArrows(A);
	}
	// Combo / cancel windows
	const float CancelAt = ActiveEnd + A.Recovery * 0.3f;
	if (T >= CancelAt && !Buffered.IsEmpty())
	{
		const FString& B = Buffered;
		if (B == TEXT("dodge") || B == TEXT("ability") || B == TEXT("heavy") || (B == TEXT("attack") && !bAttackIsHeavy) || (B == TEXT("attack") && T >= ActiveEnd + A.Recovery * 0.6f))
		{
			State = TEXT("normal");
			G.Fx->bTrailActive = false;
			if (bAttackIsHeavy && B == TEXT("attack")) ComboIndex = 0;
			ConsumeBuffered();
			return;
		}
	}
	if (T >= Total)
	{
		State = TEXT("normal");
		StateT = 0.f;
		Attack = nullptr;
		G.Fx->bTrailActive = false;
	}
}

void FLBPlayer::MeleeHits(const FLBAttackDef& A)
{
	const float HalfArc = FMath::DegreesToRadians(A.Arc) / 2.f;
	TArray<FLBEnemy*> Targets;
	for (const TUniquePtr<FLBEnemy>& E : G.Enemies) Targets.Add(E.Get());
	for (FLBEnemy* E : Targets)
	{
		if (!E->Alive() || !E->bTargetable || AttackHit.Contains(E->Uid)) continue;
		const float Dx = E->Pos.X - Pos.X;
		const float Dz = E->Pos.Z - Pos.Z;
		const float D = FMath::Sqrt(Dx * Dx + Dz * Dz);
		if (D - E->Radius > A.Range) continue;
		if (A.Arc < 360.f)
		{
			const float Ang = FMath::Abs(AngleDiff(Yaw, FMath::Atan2(Dx, Dz)));
			// Allow a little extra angle for very close enemies.
			const float Slack = D < 1.2f ? 0.6f : 0.f;
			if (Ang > HalfArc + Slack) continue;
		}
		AttackHit.Add(E->Uid);
		FLBHitInfo H;
		H.Mult = A.Damage;
		H.Poise = A.Poise;
		H.Knockback = A.Knockback;
		H.Bleed = A.Bleed;
		H.FromX = Pos.X;
		H.FromZ = Pos.Z;
		H.bHeavy = bAttackIsHeavy || A.Damage >= 1.8f;
		const FString DefId = E->Def.Id;
		const int32 Dealt = G.HitEnemy(*E, H);
		if (Dealt > 0 && DefId == TEXT("training_dummy"))
		{
			G.QuestEvent(TEXT("tut_attack"));
			if (bAttackIsHeavy) G.QuestEvent(TEXT("tut_heavy"));
		}
	}
}

void FLBPlayer::FireArrows(const FLBAttackDef& A)
{
	const float Ox = Pos.X + FMath::Sin(Yaw) * 0.6f;
	const float Oz = Pos.Z + FMath::Cos(Yaw) * 0.6f;
	const float Oy = Pos.Y + 1.35f;
	float BaseYaw = Yaw;
	float Pitch = 0.f;
	if (LockTarget)
	{
		BaseYaw = YawTo(Ox, Oz, LockTarget->Pos.X, LockTarget->Pos.Z);
		const float D = FMath::Sqrt(FMath::Square(LockTarget->Pos.X - Ox) + FMath::Square(LockTarget->Pos.Z - Oz));
		Pitch = FMath::Atan2(LockTarget->Pos.Y + LockTarget->AimHeight() - Oy, D);
	}
	for (int32 I = 0; I < A.ProjCount; I++)
	{
		const float Y = BaseYaw + (A.ProjCount > 1 ? (I - (A.ProjCount - 1) / 2.f) * A.ProjSpread : 0.f);
		const FVector Dir(FMath::Sin(Y) * FMath::Cos(Pitch), FMath::Sin(Pitch), FMath::Cos(Y) * FMath::Cos(Pitch));
		FLBHitInfo H;
		H.Mult = A.Damage;
		H.Poise = A.Poise;
		H.Knockback = A.Knockback;
		H.FromX = Ox;
		H.FromZ = Oz;
		H.bHeavy = bAttackIsHeavy;
		H.bNoHitstop = true;
		G.Projectiles->SpawnArrow(FVector(Ox, Oy, Oz), Dir, A.ProjSpeed, A.ProjRadius, A.ProjPierce, H);
	}
	G.Sfx(TEXT("arrow"), Pos.X, Pos.Z);
}

void FLBPlayer::TrySwap()
{
	if (G.Data.Weapon2.IsEmpty() || SwapT > 0.f) return;
	G.Data.ActiveWeapon = G.Data.ActiveWeapon == 0 ? 1 : 0;
	EquipWeapon();
	SwapT = 0.3f;
	G.SfxUI(TEXT("swap"));
	FLBBurst B;
	B.Count = 10;
	B.Color = TrailColorFor(WeaponType);
	B.Speed = 3.f;
	B.Life = 0.4f;
	G.Fx->Burst(Pos.X, Pos.Y + 1.2f, Pos.Z, B);
	G.QuestEvent(TEXT("tut_swap"));
	G.OnWeaponSwapped();
}

void FLBPlayer::TryHeal()
{
	if (FLBRules::CountItem(G.Data, TEXT("dango")) <= 0)
	{
		G.Caption(TEXT("You have no Healing Dango."), FString(), 1.5f);
		G.SfxUI(TEXT("uiError"));
		return;
	}
	if (Hp >= G.Stats().MaxHp)
	{
		G.Caption(TEXT("Already at full health."), FString(), 1.2f);
		return;
	}
	State = TEXT("heal");
	StateT = 0.f;
	bHealApplied = false;
}

void FLBPlayer::ApplyHeal()
{
	bHealApplied = true;
	if (!FLBRules::RemoveItem(G.Data, TEXT("dango"), 1)) return;
	const float Mult = FLBRules::HasSpecial(*G.D, G.Data, TEXT("teaMastery")) ? 1.5f : 1.f;
	const float Amount = FMath::RoundToFloat(G.Stats().MaxHp * 0.45f * Mult);
	Hp = FMath::Min(G.Stats().MaxHp, Hp + Amount);
	G.Fx->FloatText(Pos.X, Pos.Y + 2.2f, Pos.Z, FString::Printf(TEXT("+%d"), int32(Amount)), FLinearColor(0.54f, 1.f, 0.6f), 1.f, 1.f, false);
	FLBBurst B;
	B.Count = 24;
	B.Color = 0x8aff9a;
	B.Speed = 2.5f;
	B.Life = 0.9f;
	B.Gravity = -2.f;
	B.Size = 1;
	B.Spread = 0.8f;
	G.Fx->Burst(Pos.X, Pos.Y + 1.f, Pos.Z, B);
	G.SfxUI(TEXT("heal"));
	BurnT = 0.f;
}

// =================================================================== Abilities

bool FLBPlayer::TryAbility()
{
	const FLBAbilityDef& Ab = Family->Ability;
	if (AbilityCd.FindRef(WeaponType) > 0.f)
	{
		G.SfxUI(TEXT("uiError"), 0.4f);
		return false;
	}
	if (Spirit < Ab.Cost)
	{
		G.Caption(FString::Printf(TEXT("Not enough spirit for %s."), *Ab.Name), FString(), 1.2f);
		G.SfxUI(TEXT("uiError"), 0.4f);
		return false;
	}
	if (Ab.Kind == TEXT("shadowStep"))
	{
		FLBEnemy* Target = LockTarget ? LockTarget : NearestEnemy(Ab.Radius);
		if (!Target)
		{
			G.Caption(TEXT("No target for Shadow Step."), FString(), 1.2f);
			return false;
		}
		StepTarget = Target;
	}
	Spirit -= Ab.Cost;
	AbilityCd.Add(WeaponType, Ab.Cooldown);
	State = TEXT("ability");
	StateT = 0.f;
	AbilityKind = Ab.Kind;
	AbilityHit.Reset();
	bAbilityFired = false;
	AbilityTick = 0.f;
	G.Fx->bTrailActive = false;
	G.Sfx(TEXT("ability"), Pos.X, Pos.Z);
	if (Ab.Kind != TEXT("shadowStep")) Yaw = AimYaw(12.f);
	if (Ab.Kind == TEXT("emberRain"))
	{
		FLBEnemy* T = LockTarget ? LockTarget : NearestEnemy(18.f);
		if (T) AbilityTarget = T->Pos;
		else AbilityTarget = FVector(Pos.X + FMath::Sin(Yaw) * 8.f, 0.f, Pos.Z + FMath::Cos(Yaw) * 8.f);
		AbilityTarget.Y = G.Area ? G.Area->GroundY(AbilityTarget.X, AbilityTarget.Z) : 0.f;
		G.Hazards->EmberRain(AbilityTarget, Ab.Radius, Ab.Duration, Ab.Damage);
	}
	return true;
}

FLBEnemy* FLBPlayer::NearestEnemy(float MaxDist)
{
	FLBEnemy* Best = nullptr;
	float Bd = MaxDist;
	for (const TUniquePtr<FLBEnemy>& E : G.Enemies)
	{
		if (!E->Alive() || !E->bTargetable) continue;
		const float D = FVector::Dist(E->Pos, Pos);
		if (D < Bd)
		{
			Bd = D;
			Best = E.Get();
		}
	}
	return Best;
}

void FLBPlayer::AbilityStrike(FLBEnemy& E, float Mult, float Poise, float Knockback, float Stun, bool bForceCrit, float Bleed)
{
	FLBHitInfo H;
	H.Mult = Mult;
	H.Poise = Poise;
	H.Knockback = Knockback;
	H.FromX = Pos.X;
	H.FromZ = Pos.Z;
	H.bNoHitstop = true;
	H.bHeavy = true;
	H.Source = TEXT("ability");
	H.Stun = Stun;
	H.bForceCrit = bForceCrit;
	H.Bleed = Bleed;
	G.HitEnemy(E, H);
}

float FLBPlayer::UpdateAbility(float Dt, float Mx, float Mz, float Mlen)
{
	const FLBAbilityDef& Ab = Family->Ability;
	const float T = StateT;
	float Speed = 0.f;
	TArray<FLBEnemy*> Targets;
	for (const TUniquePtr<FLBEnemy>& E : G.Enemies) Targets.Add(E.Get());
	if (AbilityKind == TEXT("iaiDash"))
	{
		const float DashSpeed = 7.5f / FMath::Max(0.05f, Ab.Duration);
		if (T < Ab.Duration)
		{
			MoveBy(FMath::Sin(Yaw) * DashSpeed * Dt, FMath::Cos(Yaw) * DashSpeed * Dt);
			Speed = DashSpeed;
			G.Fx->bTrailActive = true;
			FLBBurst B;
			B.Count = 3;
			B.Color = 0xbfe6ff;
			B.Speed = 1.f;
			B.Life = 0.4f;
			B.Size = 1;
			G.Fx->Burst(Pos.X, Pos.Y + 1.f, Pos.Z, B);
			for (FLBEnemy* E : Targets)
			{
				if (!E->Alive() || !E->bTargetable || AbilityHit.Contains(E->Uid)) continue;
				if (Dist2(E->Pos, Pos) < Ab.Radius + E->Radius)
				{
					AbilityHit.Add(E->Uid);
					AbilityStrike(*E, Ab.Damage);
				}
			}
		}
		else G.Fx->bTrailActive = false;
		if (T >= Ab.Duration + 0.25f) EndAbility();
	}
	else if (AbilityKind == TEXT("whirlwind"))
	{
		if (Mlen > 0.05f)
		{
			const float Sp = BaseSpeed * 0.6f;
			MoveBy(Mx * Sp * Dt, Mz * Sp * Dt);
			Speed = Sp;
		}
		SpinYaw = WrapAngle(SpinYaw + Dt * 16.f);
		G.Fx->bTrailActive = true;
		AbilityTick -= Dt;
		if (AbilityTick <= 0.f)
		{
			AbilityTick = 0.25f;
			G.Sfx(TEXT("swing"), Pos.X, Pos.Z, 0.6f);
			for (FLBEnemy* E : Targets)
			{
				if (!E->Alive() || !E->bTargetable) continue;
				if (Dist2(E->Pos, Pos) < Ab.Radius + E->Radius) AbilityStrike(*E, Ab.Damage, 12.f, 1.f);
			}
		}
		if (T >= Ab.Duration)
		{
			SpinYaw = 0.f;
			EndAbility();
		}
	}
	else if (AbilityKind == TEXT("shadowStep"))
	{
		FLBEnemy* Target = StepTarget;
		bool bStillThere = false;
		for (FLBEnemy* E : Targets) bStillThere |= E == Target;
		if (!bStillThere) Target = nullptr;
		if (T < 0.12f) SetVisible(FMath::FloorToInt(T * 40.f) % 2 == 0);
		else if (!bAbilityFired && Target)
		{
			SetVisible(true);
			bAbilityFired = true;
			const float Dir = FMath::Atan2(Target->Pos.X - Pos.X, Target->Pos.Z - Pos.Z);
			const float Behind = Target->Radius + 1.f;
			const float Nx = Target->Pos.X + FMath::Sin(Dir) * Behind;
			const float Nz = Target->Pos.Z + FMath::Cos(Dir) * Behind;
			FLBBurst B;
			B.Count = 16;
			B.Color = 0x8a4aff;
			B.Speed = 3.f;
			B.Life = 0.5f;
			B.Size = 1;
			G.Fx->Burst(Pos.X, Pos.Y + 1.f, Pos.Z, B);
			MoveBy(Nx - Pos.X, Nz - Pos.Z);
			Yaw = YawTo(Pos.X, Pos.Z, Target->Pos.X, Target->Pos.Z);
			G.Fx->Burst(Pos.X, Pos.Y + 1.f, Pos.Z, B);
			if (Target->Alive()) AbilityStrike(*Target, Ab.Damage, 40.f, 3.f, 0.f, true, 1.f);
			G.Fx->bTrailActive = true;
		}
		if (T >= 0.45f)
		{
			SetVisible(true);
			EndAbility();
		}
	}
	else if (AbilityKind == TEXT("earthshaker"))
	{
		JumpH = FMath::Sin(FMath::Clamp(T / FMath::Max(0.05f, Ab.Duration), 0.f, 1.f) * UE_PI) * 1.6f;
		if (T < Ab.Duration * 0.8f) MoveBy(FMath::Sin(Yaw) * 3.f * Dt, FMath::Cos(Yaw) * 3.f * Dt);
		if (T >= Ab.Duration && !bAbilityFired)
		{
			bAbilityFired = true;
			G.Fx->Shockwave(Pos.X, Pos.Y, Pos.Z, Ab.Radius, 0xffa040, 0.6f);
			FLBBurst B;
			B.Count = 40;
			B.Color = 0xc8a878;
			B.Speed = 8.f;
			B.Life = 0.8f;
			B.Gravity = 10.f;
			B.Size = 1;
			B.UpBias = 1.2f;
			G.Fx->Burst(Pos.X, Pos.Y + 0.2f, Pos.Z, B);
			G.Shake(0.8f);
			G.Sfx(TEXT("explosion"), Pos.X, Pos.Z);
			for (FLBEnemy* E : Targets)
			{
				if (!E->Alive() || !E->bTargetable) continue;
				if (Dist2(E->Pos, Pos) < Ab.Radius + E->Radius) AbilityStrike(*E, Ab.Damage, 120.f, 5.f, 2.f);
			}
		}
		if (T >= Ab.Duration + 0.35f)
		{
			JumpH = 0.f;
			EndAbility();
		}
	}
	else
	{
		// emberRain: the hazard does the work.
		if (T >= 0.45f) EndAbility();
	}
	return Speed;
}

void FLBPlayer::EndAbility()
{
	State = TEXT("normal");
	StateT = 0.f;
	AbilityKind.Empty();
	G.Fx->bTrailActive = false;
}

// =================================================================== Damage

bool FLBPlayer::TakeDamage(float Amount, float FromX, float FromZ, float Knockback)
{
	Hp -= Amount;
	FlashT = 0.12f;
	const float Dx = Pos.X - FromX;
	const float Dz = Pos.Z - FromZ;
	float D = FMath::Sqrt(Dx * Dx + Dz * Dz);
	if (D <= 0.f) D = 1.f;
	Vel.X += Dx / D * Knockback * 3.f;
	Vel.Z += Dz / D * Knockback * 3.f;
	if (Hp <= 0.f)
	{
		if (!bSecondWindUsed && FLBRules::HasSpecial(*G.D, G.Data, TEXT("secondWind")))
		{
			bSecondWindUsed = true;
			Hp = FMath::RoundToFloat(G.Stats().MaxHp * 0.3f);
			InvulnT = 1.5f;
			G.Caption(TEXT("Second Wind!"), FString(), 1.5f);
			FLBBurst B;
			B.Count = 30;
			B.Color = 0xffe08a;
			B.Speed = 4.f;
			B.Life = 0.8f;
			B.Size = 1;
			G.Fx->Burst(Pos.X, Pos.Y + 1.f, Pos.Z, B);
			return false;
		}
		Hp = 0.f;
		State = TEXT("dead");
		StateT = 0.f;
		Attack = nullptr;
		G.Fx->bTrailActive = false;
		return true;
	}
	// Abilities and heavy-weapon heavies have hyper armour.
	if (State != TEXT("ability") && !(State == TEXT("attack") && bAttackIsHeavy && WeaponType == TEXT("kanabo")))
	{
		State = TEXT("hit");
		StateT = 0.f;
		Attack = nullptr;
		G.Fx->bTrailActive = false;
	}
	InvulnT = 0.35f;
	return false;
}

// =================================================================== Animation

void FLBPlayer::Animate(float Dt, float Speed)
{
	if (!Rig.IsValid()) return;
	Phase += Dt * FMath::Max(2.f, Speed * 1.5f);
	FString BaseName = TEXT("idle");
	if (WeaponType == TEXT("bow")) BaseName = TEXT("idleBow");
	else if (WeaponType == TEXT("tanto")) BaseName = TEXT("idleTwin");
	else if (WeaponType == TEXT("kanabo")) BaseName = TEXT("idleHeavy");
	FLBPose Pose = LBPose(BaseName);
	float Rate = 16.f;
	float SpinnerX = 0.f;
	if (State == TEXT("normal") || State == TEXT("frozen"))
	{
		if (Speed > 0.5f) Pose = Pose + LBLocomotion(Phase, FMath::Min(1.2f, Speed / 6.f));
		else
		{
			FLBPose Breath;
			Breath.Set(ELBJoint::Torso, FMath::Sin(G.Time * 1.8f) * 0.03f);
			Pose = Pose + Breath;
		}
	}
	else if (State == TEXT("attack") && Attack)
	{
		const FString Prefix = Attack->Pose;
		if (StateT < Attack->Windup)
		{
			Pose = LBPose(Prefix + TEXT("_wind"));
			Rate = FMath::Max(10.f, 12.f / FMath::Max(0.3f, Attack->Windup * 3.f));
		}
		else
		{
			Pose = LBPose(Prefix + TEXT("_hit"));
			Rate = 40.f;
		}
		if (Prefix == TEXT("spin"))
		{
			const float P = FMath::Clamp((StateT - Attack->Windup) / (Attack->Active + Attack->Recovery * 0.5f), 0.f, 1.f);
			SpinYaw = StateT >= Attack->Windup ? P * UE_PI * 2.f : 0.f;
			if (P >= 1.f) SpinYaw = 0.f;
		}
	}
	else if (State == TEXT("dodge"))
	{
		Pose = LBPose(TEXT("roll"));
		Rate = 30.f;
		SpinnerX = FMath::Clamp(StateT / (DodgeTime * 0.85f), 0.f, 1.f) * UE_PI * 2.f;
	}
	else if (State == TEXT("hit"))
	{
		Pose = LBPose(TEXT("hit"));
		Rate = 25.f;
	}
	else if (State == TEXT("dead"))
	{
		Pose = LBPose(TEXT("dead"));
		Rate = 6.f;
	}
	else if (State == TEXT("heal"))
	{
		Pose = LBPose(TEXT("heal"));
		Rate = 12.f;
	}
	else if (State == TEXT("ability"))
	{
		if (AbilityKind == TEXT("iaiDash")) Pose = LBPose(TEXT("slashR_hit"));
		else if (AbilityKind == TEXT("whirlwind")) Pose = LBPose(TEXT("spin_hit"));
		else if (AbilityKind == TEXT("shadowStep")) Pose = LBPose(TEXT("thrust_hit"));
		else if (AbilityKind == TEXT("earthshaker")) Pose = LBPose(StateT < Family->Ability.Duration * 0.6f ? TEXT("overhead_wind") : TEXT("overhead_hit"));
		else Pose = LBPose(TEXT("cast"));
		Rate = 25.f;
	}
	if (State != TEXT("attack") && State != TEXT("ability")) SpinYaw = 0.f;
	Rig.ApplyPose(Pose, Dt, Rate);
	if (Rig.Spinner)
	{
		if (State == TEXT("dead"))
		{
			FRotator R = Rig.Spinner->GetRelativeRotation();
			R.Pitch += (90.f - R.Pitch) * FMath::Min(1.f, Dt * 5.f);
			Rig.Spinner->SetRelativeRotation(R);
			FVector L = Rig.Spinner->GetRelativeLocation();
			L.Z += (25.f - L.Z) * FMath::Min(1.f, Dt * 5.f);
			Rig.Spinner->SetRelativeLocation(L);
		}
		else
		{
			// Forward roll: the web build's positive x rotation is a negative Unreal pitch.
			Rig.Spinner->SetRelativeRotation(FRotator(-FMath::RadiansToDegrees(SpinnerX), 0.f, 0.f));
			Rig.Spinner->SetRelativeLocation(FVector(0.f, 0.f, (0.55f - (State == TEXT("dodge") ? 0.25f : 0.f) + JumpH) * 100.f));
		}
	}
	// Hit flash / parry glow / invulnerability flicker (a light, since materials are shared).
	if (FlashLight)
	{
		if (FlashT > 0.f)
		{
			FlashT -= Dt;
			FlashLight->SetLightColor(LB::Hex(0xff4040));
			FlashLight->SetIntensity(G.Settings().bReduceFlashing ? 4.f : 25.f);
		}
		else if (ParryT > 0.f)
		{
			FlashLight->SetLightColor(LB::Hex(0x6ab8ff));
			FlashLight->SetIntensity(15.f);
		}
		else if (InvulnT > 0.f && State != TEXT("dodge"))
		{
			FlashLight->SetLightColor(FLinearColor::White);
			FlashLight->SetIntensity(FMath::FloorToInt(G.Time * 20.f) % 2 ? 8.f : 0.f);
		}
		else FlashLight->SetIntensity(0.f);
	}
}

void FLBPlayer::UpdateTrail()
{
	if (!G.Fx || !WeaponMesh || !G.Fx->bTrailActive || WeaponType == TEXT("bow")) return;
	const FTransform T = WeaponMesh->GetComponentTransform();
	const float BaseZ = WeaponType == TEXT("naginata") ? -129.f : WeaponType == TEXT("kanabo") ? -14.f : WeaponType == TEXT("tanto") ? -8.f : -15.f;
	G.Fx->TrailPush(T.TransformPosition(FVector(0.f, 0.f, BaseZ)), T.TransformPosition(FVector(0.f, 0.f, -BladeLength)));
}
