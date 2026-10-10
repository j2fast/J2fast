// Gameplay entities (ports of src/entities/*.ts). They are plain C++ classes
// simulated at a fixed step by FLBGame; each one draws itself through an
// ALBVisual actor. Positions are game coordinates: metres, Pos.Y is height,
// yaw in radians with 0 facing +z (see LBMath.h for the mapping to Unreal).

#pragma once

#include "CoreMinimal.h"
#include "LBRig.h"
#include "LBTypes.h"

class FLBGame;
class ALBVisual;
class UPointLightComponent;
class UProceduralMeshComponent;
struct FLBInputFrame;

/** A hit from the player (or companion / damage over time) on an enemy. */
struct FLBHitInfo
{
	float Mult = 1.f;
	float Poise = 0.f;
	float Knockback = 0.f;
	bool bForceCrit = false;
	float Bleed = 0.f;
	float FromX = 0.f;
	float FromZ = 0.f;
	bool bHeavy = false;
	bool bNoHitstop = false;
	float Stun = 0.f;
	FString Source;
	/** Exact damage (damage-over-time ticks), bypassing the attack formula. */
	int32 FixedDamage = -1;
};

/** An enemy attack hitting the player (raw damage before defence). */
struct FLBEnemyHit
{
	float Damage = 0.f;
	float FromX = 0.f;
	float FromZ = 0.f;
	float Knockback = 1.f;
	FString StatusType;
	float StatusTime = 0.f;
	FString Source;
};

namespace LBMathG
{
	inline float YawTo(float AX, float AZ, float BX, float BZ) { return FMath::Atan2(BX - AX, BZ - AZ); }
	inline float WrapAngle(float A)
	{
		while (A > UE_PI) A -= 2.f * UE_PI;
		while (A < -UE_PI) A += 2.f * UE_PI;
		return A;
	}
	inline float AngleDiff(float From, float To) { return WrapAngle(To - From); }
	inline float ApproachAngle(float From, float To, float MaxStep)
	{
		const float D = AngleDiff(From, To);
		return FMath::Abs(D) <= MaxStep ? To : WrapAngle(From + FMath::Sign(D) * MaxStep);
	}
	inline float Damp(float Rate, float Dt) { return 1.f - FMath::Exp(-Rate * Dt); }
	inline float Dist2(const FVector& A, const FVector& B) { return FMath::Sqrt(FMath::Square(A.X - B.X) + FMath::Square(A.Z - B.Z)); }
}

// =================================================================== Enemy

class FLBEnemy
{
public:
	FLBEnemy(FLBGame& G, const FLBEnemyDef& Def, int32 Level, const FString& SpawnId, float HealthMult);
	~FLBEnemy();

	const FLBEnemyDef& Def;
	int32 Uid = 0;
	FString SpawnId;
	int32 Level = 1;
	FVector Pos = FVector::ZeroVector;
	FVector Vel = FVector::ZeroVector;
	FVector Home = FVector::ZeroVector;
	float Yaw = 0.f;
	float Radius = 0.5f;
	float Hp = 1.f, MaxHp = 1.f, Atk = 1.f, Defense = 0.f, CoinMult = 1.f;
	int32 Xp = 0;
	FString State = TEXT("idle");
	float StateT = 0.f;
	const FLBEnemyAttack* Attack = nullptr;
	float Poise = 10.f;
	bool bAggro = false;
	bool bHasToken = false;
	bool bBoss = false;
	int32 Phase = 1;
	bool bTargetable = true;
	bool bInvulnerable = false;
	bool bDormant = false;
	bool bSummoned = false;
	bool bRemoved = false;
	float DeadT = 0.f;

	bool Alive() const { return State != TEXT("dead"); }
	float AimHeight() const;
	float ModelHeight() const { return Rig.Height / 100.f; }

	void Place(float X, float Y, float Z, float InYaw);
	void Update(float Dt);
	void ReceiveHit(float Amount, const FLBHitInfo& Hit);
	void Die();
	void StartIntro();
	void CancelAttack();
	/** Removes telegraphs, beams and the actor. */
	void Dispose();

private:
	FLBGame& G;
	ALBVisual* Actor = nullptr;
	FLBRig Rig;
	UPointLightComponent* Glow = nullptr;
	UProceduralMeshComponent* Beam = nullptr;
	TMap<FString, float> Cooldowns;
	float GlobalCd = 0.8f;
	TArray<int32> Telegraphs;
	float FlashT = 0.f;
	float BleedT = 0.f, BleedDps = 0.f, BurnT = 0.f, BurnDps = 0.f, DotTick = 0.f;
	float StunT = 0.f;
	float StrafeDir = 1.f, StrafeT = 0.f;
	bool bHitLanded = false;
	FVector LeapFrom = FVector::ZeroVector, LeapTo = FVector::ZeroVector;
	TArray<FVector> PillarPos;
	float BeamYaw = 0.f;
	float SpiralAngle = 0.f;
	float Tick = 0.f;
	float AnimT = 0.f;
	float MoveSpeedNow = 0.f;
	float WanderT = 0.f;
	FVector WanderTarget = FVector::ZeroVector;
	float EvadeT = 0.f;
	float PoiseRegenT = 0.f;
	float StaggerImmuneT = 0.f;
	float FlinchCd = 0.f;
	float LeapHeight = 0.f;
	bool bHidden = false;

	void SetState(const TCHAR* S);
	void UpdateIdle(float Dt);
	void UpdateCombat(float Dt, float Dist, float ToPlayer);
	float PreferredMelee() const;
	const FLBEnemyAttack* ChooseAttack(float Gap);
	void BeginAttack(const FLBEnemyAttack& A);
	void UpdateWindup(float Dt, float ToPlayer);
	void OnActiveStart();
	void UpdateActive(float Dt);
	void FinishAttack();
	void LandHit(float Dmg, const FLBEnemyAttack& A);
	void MoveBy(float Dx, float Dz);
	void MoveDir(float InYaw, float Speed, float Dt);
	void MoveToward(float X, float Z, float Speed, float Dt);
	void AlertAllies();
	void CheckPhase();
	void UpdateDots(float Dt);
	void UpdateTelegraphFollow();
	void Animate(float Dt, float Speed);
	FString PoseFor(const FLBEnemyAttack& A) const;
	int32 OrbColor() const;
	void SetHidden(bool bHide);
	void UpdateBeam();
	void RemoveBeam();
	void SyncTransform();
	float Dmg(const FLBEnemyAttack& A) const;
};

// =================================================================== Player

class FLBPlayer
{
public:
	explicit FLBPlayer(FLBGame& G);
	~FLBPlayer();

	FVector Pos = FVector::ZeroVector;
	float Yaw = 0.f;
	FVector Vel = FVector::ZeroVector;
	const float Radius = 0.45f;
	float Hp = 100.f, Stamina = 100.f, Spirit = 0.f;
	FString State = TEXT("normal"); // normal attack dodge hit dead heal ability frozen
	float StateT = 0.f;
	FString WeaponType = TEXT("katana");
	const FLBWeaponFamily* Family = nullptr;
	const FLBAttackDef* Attack = nullptr;
	bool bAttackIsHeavy = false;
	int32 ComboIndex = 0;
	float DodgeStartTime = -10.f;
	float InvulnT = 0.f;
	TMap<FString, float> AbilityCd;
	float BurnT = 0.f, SlowT = 0.f;
	float BuffAtk = 0.f, BuffT = 0.f;
	bool bSecondWindUsed = false;
	FLBEnemy* LockTarget = nullptr;
	bool bInWater = false;
	FVector2D MoveIntent = FVector2D::ZeroVector;
	float ParryT = 0.f;

	bool Alive() const { return State != TEXT("dead"); }
	bool Invulnerable() const;
	void EquipWeapon();
	void Place(float X, float Y, float Z, float InYaw);
	void ResetCombatState();
	void Update(float Dt, const FLBInputFrame& In, float CamYaw);
	void MoveBy(float Dx, float Dz);
	/** Already-mitigated damage. Returns true if the player died. */
	bool TakeDamage(float Amount, float FromX, float FromZ, float Knockback);
	void SetLanternIntensity(float I);
	void SetVisible(bool bVisible);
	void Freeze() { State = TEXT("frozen"); StateT = 0.f; }
	void Unfreeze() { if (State == TEXT("frozen")) { State = TEXT("normal"); StateT = 0.f; } }

private:
	FLBGame& G;
	ALBVisual* Actor = nullptr;
	FLBRig Rig;
	UPointLightComponent* Lantern = nullptr;
	UPointLightComponent* FlashLight = nullptr;
	UProceduralMeshComponent* WeaponMesh = nullptr;
	UProceduralMeshComponent* OffhandMesh = nullptr;
	float BladeLength = 90.f;
	float ComboResetT = 0.f;
	TSet<int32> AttackHit;
	bool bFiredProjectile = false;
	FString Buffered;
	float BufferedT = 0.f;
	float DodgeDirX = 0.f, DodgeDirZ = 1.f;
	float StaminaDelay = 0.f;
	FString AbilityKind;
	TSet<int32> AbilityHit;
	float AbilityTick = 0.f;
	FVector AbilityTarget = FVector::ZeroVector;
	FLBEnemy* StepTarget = nullptr;
	bool bAbilityFired = false;
	bool bHealApplied = false;
	float BurnTick = 0.f;
	float MoveSpeed = 0.f;
	float Phase = 0.f;
	float SpinYaw = 0.f;
	float FlashT = 0.f;
	float StepT = 0.f;
	float SwapT = 0.f;
	float JumpH = 0.f;

	bool ConsumeBuffered();
	bool TryDodge();
	float AimYaw(float MaxDist);
	void StartAttack(const FLBAttackDef& Def, bool bHeavy);
	void UpdateAttack(float Dt);
	void MeleeHits(const FLBAttackDef& A);
	void FireArrows(const FLBAttackDef& A);
	void TrySwap();
	void TryHeal();
	void ApplyHeal();
	bool TryAbility();
	FLBEnemy* NearestEnemy(float MaxDist);
	void AbilityStrike(FLBEnemy& E, float Mult, float Poise = 40.f, float Knockback = 3.f, float Stun = 0.f, bool bForceCrit = false, float Bleed = 0.f);
	float UpdateAbility(float Dt, float Mx, float Mz, float Mlen);
	void EndAbility();
	void ApplyKnockback(float Dt);
	void SyncTransform();
	void Animate(float Dt, float Speed);
	void UpdateTrail();
};

// =================================================================== Projectiles, hazards, pickups

class FLBProjectiles
{
public:
	explicit FLBProjectiles(FLBGame& G) : G(G) {}
	void SpawnArrow(const FVector& Pos, const FVector& Dir, float Speed, float Radius, bool bPierce, const FLBHitInfo& Info);
	void SpawnOrb(const FVector& Pos, float Yaw, float Speed, float Damage, const FString& StatusType, float StatusTime, int32 Color, const FString& Source);
	void Update(float Dt);
	void Clear();
	int32 Count() const { return List.Num(); }

private:
	struct FProj
	{
		ALBVisual* Actor = nullptr;
		FVector Pos, Vel;
		float Radius = 0.3f, Life = 1.f;
		bool bPlayer = true, bPierce = false, bDead = false;
		TSet<int32> Hit;
		FLBHitInfo Info;
		float Damage = 0.f;
		FString StatusType;
		float StatusTime = 0.f;
		FString Source;
		int32 Color = 0xffffff;
	};
	FLBGame& G;
	TArray<FProj> List;
};

class FLBHazards
{
public:
	explicit FLBHazards(FLBGame& G) : G(G) {}
	void Ring(const FVector& Center, float MaxRadius, float Speed, float Damage, int32 Color, const FString& Source);
	void EmberRain(const FVector& Center, float Radius, float Duration, float DamageMult);
	void Update(float Dt);
	void Clear();

private:
	struct FHaz
	{
		bool bRing = true;
		FVector Center;
		float Radius = 1.f, MaxRadius = 10.f, Speed = 8.f, Damage = 1.f;
		bool bHit = false;
		float T = 0.f, Duration = 1.f, TickT = 0.2f;
		int32 Color = 0xff7a3a;
		FString Source;
		ALBVisual* Actor = nullptr;
		UProceduralMeshComponent* Mesh = nullptr;
	};
	FLBGame& G;
	TArray<FHaz> List;
	void Draw(FHaz& H);
};

struct FLBPickupContent
{
	enum EKind { Coins, Item, Equipment } Kind = Coins;
	int32 Amount = 0;
	FString Id;
	int32 Qty = 1;
	FLBItemInstance Gen;
};

class FLBPickups
{
public:
	explicit FLBPickups(FLBGame& G) : G(G) {}
	void Spawn(const FLBPickupContent& C, float X, float Y, float Z);
	/** Returns what the player collected this step. */
	TArray<FLBPickupContent> Update(float Dt, const FVector& PlayerPos);
	void Clear();

private:
	struct FPick
	{
		FLBPickupContent Content;
		FVector Pos, Vel;
		float T = 0.f;
		bool bMagnet = false;
		ALBVisual* Actor = nullptr;
	};
	FLBGame& G;
	TArray<FPick> List;
};

// =================================================================== NPCs and companion

class FLBNpc
{
public:
	FLBNpc(FLBGame& G, const FString& Id, float X, float Y, float Z, float Yaw);
	~FLBNpc();
	FString Id;
	FString Name;
	FVector Pos;
	float Yaw = 0.f;
	bool bTalking = false;
	/** 0 none, 1 new quest ("!"), 2 report ("?") */
	int32 Marker = 0;
	float Height() const { return Rig.Height / 100.f; }
	void Update(float Dt, const FVector& PlayerPos);

private:
	FLBGame& G;
	ALBVisual* Actor = nullptr;
	FLBRig Rig;
	float BaseYaw = 0.f;
	float T = 0.f;
};

class FLBCompanion
{
public:
	explicit FLBCompanion(FLBGame& G);
	~FLBCompanion();
	FVector Pos = FVector::ZeroVector;
	float Yaw = 0.f;
	void Place(float X, float Y, float Z);
	void Bark(const FString& Kind);
	void Update(float Dt);
	void ForgetTarget(const FLBEnemy* E) { if (Target == E) Target = nullptr; }

private:
	FLBGame& G;
	ALBVisual* Actor = nullptr;
	FLBRig Rig;
	FString State = TEXT("follow");
	float StateT = 0.f;
	FLBEnemy* Target = nullptr;
	float Cd = 0.f;
	float T = 0.f;
	float SpeedNow = 0.f;
	float BarkCd = 10.f;
	bool bLowHpBarked = false;
	void MoveToward(float X, float Z, float Speed, float Dt);
};
