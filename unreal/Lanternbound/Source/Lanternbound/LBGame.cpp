// Game orchestration (port of src/game/game.ts and camera.ts).

#include "LBGame.h"
#include "LBGameMode.h"
#include "LBGameInstance.h"
#include "LBArea.h"
#include "LBAudio.h"
#include "LBData.h"
#include "LBFx.h"
#include "LBMath.h"
#include "LBMeshKit.h"
#include "LBSave.h"
#include "LBVisual.h"
#include "Lanternbound.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Engine/World.h"

using namespace LBMathG;

// =================================================================== Camera

void FLBCameraRig::Update(float Dt, float LookX, float LookY, const FVector& P, const FVector* Lock, const ALBArea* Area, float ExtraDistance)
{
	if (Lock)
	{
		const float Want = YawTo(P.X, P.Z, Lock->X, Lock->Z);
		Yaw = WrapAngle(Yaw + AngleDiff(Yaw, Want) * Damp(7.f, Dt));
		const float D = FMath::Sqrt(FMath::Square(Lock->X - P.X) + FMath::Square(Lock->Z - P.Z));
		const float WantPitch = FMath::Clamp(0.38f - D * 0.008f, 0.18f, 0.42f);
		Pitch += (WantPitch - Pitch) * Damp(4.f, Dt);
		// Allow slight manual adjustment while locked.
		Pitch = FMath::Clamp(Pitch + LookY * 0.3f, -0.2f, 1.1f);
	}
	else
	{
		Yaw = WrapAngle(Yaw - LookX);
		Pitch = FMath::Clamp(Pitch + LookY, -0.35f, 1.15f);
	}
	const float TargetDistance = 6.4f + ExtraDistance;
	Distance += (TargetDistance - Distance) * Damp(3.f, Dt);

	FVector FocusTarget(P.X, P.Y + 1.55f, P.Z);
	if (Lock) FocusTarget = FMath::Lerp(FocusTarget, FVector(Lock->X, Lock->Y + 1.2f, Lock->Z), 0.18f);
	if (!bInit)
	{
		Focus = FocusTarget;
		bInit = true;
	}
	else Focus = FMath::Lerp(Focus, FocusTarget, Damp(14.f, Dt));

	const float Cp = FMath::Cos(Pitch);
	const FVector Dir(FMath::Sin(Yaw) * Cp, -FMath::Sin(Pitch), FMath::Cos(Yaw) * Cp);
	FVector Desired = Focus - Dir * Distance;
	if (Area)
	{
		const float Frac = Area->CameraClearance(FVector2D(Focus.X, Focus.Z), FVector2D(Desired.X, Desired.Z));
		if (Frac < 1.f) Desired = Focus - Dir * Distance * FMath::Max(0.2f, Frac);
		const float Ground = Area->GroundY(Desired.X, Desired.Z) + 0.45f;
		if (Desired.Y < Ground) Desired.Y = Ground;
	}
	Position = Desired;
	if (ShakeAmt > 0.001f)
	{
		const float S = ShakeAmt * 0.18f;
		Position += FVector((Rng.FRand() - 0.5f) * S, (Rng.FRand() - 0.5f) * S, (Rng.FRand() - 0.5f) * S);
		ShakeAmt *= FMath::Exp(-Dt * 9.f);
	}
}

// =================================================================== Lifetime

FLBGame::FLBGame(ALBGameMode* InGM) : GM(InGM)
{
	Rng.Initialize(int32(FDateTime::Now().GetTicks() & 0xffff) + 7);
}

FLBGame::~FLBGame()
{
	// At the end of play the world destroys every actor itself.
	if (!World || World->bIsTearingDown)
	{
		Fx = nullptr;
		Area = nullptr;
		bHasBarrier = false;
	}
	ClearEntities();
	Npcs.Reset();
	Companion.Reset();
	Player.Reset();
	Projectiles.Reset();
	Hazards.Reset();
	Pickups.Reset();
}

const FLBSettings& FLBGame::Settings() const
{
	static FLBSettings Fallback = LBSettingsUtil::Defaults();
	return GI ? GI->Settings : Fallback;
}

void FLBGame::Begin()
{
	World = GM->GetWorld();
	D = ULBData::Get(GM);
	GI = ULBGameInstance::Get(GM);
	PC = Cast<ALBPlayerController>(World ? World->GetFirstPlayerController() : nullptr);
	Mat = LBMaterials::Get(ELBMat::Lit);
	Audio = GM->Audio;

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Fx = World->SpawnActor<ALBFx>(ALBFx::StaticClass(), FTransform::Identity, Params);
	Camera = World->SpawnActor<ACameraActor>(ACameraActor::StaticClass(), FTransform::Identity, Params);
	if (Camera)
	{
		UCameraComponent* C = Camera->GetCameraComponent();
		C->SetConstraintAspectRatio(false);
		C->PostProcessSettings.bOverride_AutoExposureMethod = true;
		C->PostProcessSettings.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
		C->PostProcessSettings.bOverride_AutoExposureApplyPhysicalCameraExposure = true;
		C->PostProcessSettings.AutoExposureApplyPhysicalCameraExposure = false;
		C->PostProcessSettings.bOverride_AutoExposureBias = true;
		C->PostProcessSettings.bOverride_BloomIntensity = true;
		C->PostProcessSettings.BloomIntensity = 0.6f;
		C->PostProcessSettings.bOverride_VignetteIntensity = true;
		C->PostProcessSettings.VignetteIntensity = 0.35f;
		if (PC)
		{
			PC->bAutoManageActiveCameraTarget = false;
			PC->SetViewTarget(Camera);
		}
	}
	if (Audio)
	{
		Audio->Init(World);
		Audio->OnCaption = [this](const FString& Text) {
			if (!Settings().bSoundCaptions) return;
			FLBCaption C;
			C.Text = Text;
			C.Life = 2.f;
			C.bSound = true;
			Captions.Add(C);
			while (Captions.Num() > 3) Captions.RemoveAt(0);
		};
	}
	Projectiles = MakeUnique<FLBProjectiles>(*this);
	Hazards = MakeUnique<FLBHazards>(*this);
	Pickups = MakeUnique<FLBPickups>(*this);

	if (!D || !D->LoadError.IsEmpty() || D->Weapons.Num() == 0)
	{
		FatalError = D ? D->LoadError : FString(TEXT("The game data subsystem is missing."));
		if (FatalError.IsEmpty()) FatalError = TEXT("Game data is empty.");
		FatalError += TEXT("\nCheck that Content/Data contains the exported JSON and .lbm files (see README_UNREAL.md).");
		UE_LOG(LogLanternbound, Error, TEXT("%s"), *FatalError);
		Mode = ELBMode::Error;
		OpenScreen(TEXT("error"));
		return;
	}
	Player = MakeUnique<FLBPlayer>(*this);
	ApplySettings();
	ShowTitleScene();
}

ALBVisual* FLBGame::SpawnVisual()
{
	if (!World) return nullptr;
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	return World->SpawnActor<ALBVisual>(ALBVisual::StaticClass(), FTransform::Identity, Params);
}

void FLBGame::RefreshStats()
{
	if (!D) return;
	StatsCache = FLBRules::ComputeStats(*D, Data);
	if (Player && Player->Hp > StatsCache.MaxHp) Player->Hp = StatsCache.MaxHp;
}

float FLBGame::EnemyDamageMult() const
{
	return LBSettingsUtil::EnemyDamageMult(Settings());
}

void FLBGame::Sfx(const FString& Name, float X, float Z, float Volume)
{
	if (Audio) Audio->Play(Name, X, Z, Volume, true);
}

void FLBGame::SfxUI(const FString& Name, float Volume)
{
	if (Audio) Audio->Play(Name, 0.f, 0.f, Volume, false);
}

void FLBGame::Caption(const FString& Text, const FString& Speaker, float Seconds)
{
	if (Text.IsEmpty()) return;
	if (!Settings().bSubtitles && !Speaker.IsEmpty()) return;
	FLBCaption C;
	C.Text = Text;
	C.Speaker = Speaker;
	C.Life = Seconds;
	Captions.Add(C);
	while (Captions.Num() > 3) Captions.RemoveAt(0);
}

void FLBGame::Toast(const FString& Text, const FString& Kind)
{
	FLBToast T;
	T.Text = Text;
	T.Kind = Kind;
	Toasts.Add(T);
	while (Toasts.Num() > 6) Toasts.RemoveAt(0);
}

void FLBGame::Banner(const FString& Title, const FString& Sub, float Seconds)
{
	BannerTitle = Title;
	BannerSub = Sub;
	BannerT = Seconds;
}

void FLBGame::DamageFlash()
{
	if (!Settings().bReduceFlashing) DamageFlashT = 0.5f;
}

FString FLBGame::Prompt(ELBAction A) const
{
	return PC ? PC->Prompt(A) : FString(TEXT("?"));
}

FString FLBGame::WithPrompts(const FString& Text) const
{
	FString Out;
	int32 I = 0;
	while (I < Text.Len())
	{
		if (Text[I] == TEXT('{'))
		{
			const int32 End = Text.Find(TEXT("}"), ESearchCase::CaseSensitive, ESearchDir::FromStart, I);
			if (End > I)
			{
				const FString Name = Text.Mid(I + 1, End - I - 1);
				bool bFound = false;
				for (int32 A = 0; A < LBActionCount; A++)
				{
					if (Name == LBInput::ActionId(ELBAction(A)))
					{
						Out += TEXT("[") + Prompt(ELBAction(A)) + TEXT("]");
						bFound = true;
						break;
					}
				}
				if (!bFound) Out += Name;
				I = End + 1;
				continue;
			}
		}
		Out.AppendChar(Text[I]);
		I++;
	}
	return Out;
}

// =================================================================== Context API

FLBEnemy* FLBGame::SpawnEnemy(const FString& Id, float X, float Z, int32 Level, bool bSummoned)
{
	const FLBEnemyDef* Def = D ? D->Enemies.Find(Id) : nullptr;
	if (!Def || !Area) return nullptr;
	SpawnCounter++;
	const float HealthMult = Def->Id == TEXT("training_dummy") ? 1.f : LBSettingsUtil::EnemyHealthMult(Settings());
	TUniquePtr<FLBEnemy> E = MakeUnique<FLBEnemy>(*this, *Def, Level, FString::Printf(TEXT("%s_%d"), bSummoned ? TEXT("summon") : *Id, SpawnCounter), HealthMult);
	E->Uid = ++EnemyUid;
	const FVector2D P = Area->Move(X, Z, 0.f, 0.f, E->Radius);
	E->Place(P.X, Area->GroundY(P.X, P.Y), P.Y, Player ? YawTo(P.X, P.Y, Player->Pos.X, Player->Pos.Z) : 0.f);
	E->bSummoned = bSummoned;
	FLBEnemy* Raw = E.Get();
	Enemies.Add(MoveTemp(E));
	return Raw;
}

int32 FLBGame::HitEnemy(FLBEnemy& E, const FLBHitInfo& Hit)
{
	if (!E.Alive() || E.bInvulnerable || E.bDormant || Mode != ELBMode::Playing) return 0;
	const FLBStats& S = Stats();
	int32 Amount;
	bool bCrit = false;
	if (Hit.FixedDamage >= 0) Amount = Hit.FixedDamage;
	else Amount = FLBRules::ComputeDamage(S.Atk, Hit.Mult, S.AtkPct, Player->BuffAtk, S.Crit, S.CritDmg, Hit.bForceCrit, E.Defense, Rng, bCrit);
	E.ReceiveHit(float(Amount), Hit);
	Data.DamageDealt += Amount;
	const float Hy = E.Pos.Y + E.AimHeight();
	if (Hit.Source != TEXT("dot"))
	{
		Fx->HitSpark(E.Pos.X, Hy, E.Pos.Z, bCrit, Hit.Source == TEXT("companion") ? 0xffd27a : 0xffe0a0);
		Sfx(bCrit ? TEXT("crit") : Hit.bHeavy ? TEXT("hitHeavy") : TEXT("hit"), E.Pos.X, E.Pos.Z);
		if (!Hit.bNoHitstop) Hitstop(bCrit ? 0.09f : Hit.bHeavy ? 0.075f : 0.045f);
		if (Hit.bHeavy || bCrit) Shake(0.15f);
		// Spirit gain from landing hits.
		if (Hit.Source != TEXT("companion"))
		{
			const float Gain = (Hit.Source == TEXT("ability") ? 1.f : 4.f) * (1.f + S.SpiritGain);
			Player->Spirit = FMath::Min(S.MaxSpirit, Player->Spirit + Gain);
		}
		if (S.Lifesteal > 0.f && Player->Alive()) Player->Hp = FMath::Min(S.MaxHp, Player->Hp + Amount * S.Lifesteal);
	}
	const FLinearColor Col = bCrit ? LB::Hex(0xffd27a) : Hit.Source == TEXT("dot") ? LB::Hex(0xff9a5a) : FLinearColor(1.f, 0.97f, 0.9f);
	Fx->FloatText(E.Pos.X, Hy + 0.6f, E.Pos.Z, bCrit ? FString::Printf(TEXT("%d!"), Amount) : FString::FromInt(Amount), Col, bCrit ? 1.1f : 0.8f, bCrit ? 1.35f : (Hit.Source == TEXT("dot") ? 0.75f : 1.f));
	if (E.Hp <= 0.f) KillEnemy(E);
	return Amount;
}

bool FLBGame::HitPlayer(const FLBEnemyHit& Hit)
{
	FLBPlayer& P = *Player;
	if (!P.Alive() || Mode != ELBMode::Playing) return false;
	if (P.Invulnerable())
	{
		// Perfect dodge: dodging through an attack at the last moment.
		if (P.State == TEXT("dodge") && Time - P.DodgeStartTime < 0.22f && FLBRules::HasSpecial(*D, Data, TEXT("parryDodge")) && SlowmoT <= 0.f)
		{
			SlowmoT = 0.6f;
			P.ParryT = 0.6f;
			P.Stamina = Stats().MaxStamina;
			SfxUI(TEXT("parry"));
			Caption(TEXT("Perfect dodge!"), FString(), 1.2f);
		}
		return false;
	}
	const float Variance = 0.92f + Rng.FRand() * 0.16f;
	const float Dmg = FMath::Max(1.f, FMath::RoundToFloat(Hit.Damage * Variance * FLBRules::DefenseFactor(Stats().Def)));
	const bool bDied = P.TakeDamage(Dmg, Hit.FromX, Hit.FromZ, Hit.Knockback);
	if (Hit.StatusType == TEXT("burn")) P.BurnT = FMath::Max(P.BurnT, Hit.StatusTime);
	if (Hit.StatusType == TEXT("slow")) P.SlowT = FMath::Max(P.SlowT, Hit.StatusTime);
	Sfx(TEXT("playerHurt"), P.Pos.X, P.Pos.Z);
	Fx->FloatText(P.Pos.X, P.Pos.Y + 2.1f, P.Pos.Z, FString::FromInt(int32(Dmg)), LB::Hex(0xff6a5a), 0.9f);
	Fx->HitSpark(P.Pos.X, P.Pos.Y + 1.2f, P.Pos.Z, false, 0xff5a4a);
	Shake(0.25f + FMath::Min(0.5f, Dmg / FMath::Max(1.f, Stats().MaxHp)));
	Hitstop(0.05f);
	DamageFlash();
	if (bDied) OnPlayerDeath();
	return true;
}

void FLBGame::QuestEvent(const FString& Target)
{
	TArray<FLBQuestUpdate> U;
	FLBRules::Notify(*D, Data, Rng, TEXT("event"), Target, FString(), U);
	HandleQuestUpdates(U);
}

bool FLBGame::RequestToken(FLBEnemy& E)
{
	if (E.bHasToken) return true;
	int32 Holders = 0;
	for (const TUniquePtr<FLBEnemy>& X : Enemies) Holders += (X->Alive() && X->bHasToken && !X->bBoss) ? 1 : 0;
	return Holders < 2;
}

// =================================================================== Frame

void FLBGame::Tick(float DeltaSeconds)
{
	const float Dt = FMath::Clamp(DeltaSeconds, 0.f, 0.1f);
	FpsAcc += DeltaSeconds;
	FpsFrames++;
	if (FpsAcc >= 0.5f)
	{
		Fps = FpsFrames / FpsAcc;
		FpsAcc = 0.f;
		FpsFrames = 0;
	}
	if (!PC) PC = Cast<ALBPlayerController>(World ? World->GetFirstPlayerController() : nullptr);
	if (!PC) return;

	// Menus, dialogue choices and rebinding use navigation events every frame.
	UpdateUi(Dt);

	if (Mode != ELBMode::Error && Player)
	{
		// Variable step (sub-stepped at 30 Hz minimum); gameplay code is dt-based like the web build.
		FLBInputFrame Frame = PC->Sample(Dt);
		float Remaining = Dt;
		bool bFirst = true;
		while (Remaining > 1e-4f)
		{
			const float S = FMath::Min(Remaining, 1.f / 30.f);
			if (!bFirst)
			{
				for (int32 A = 0; A < LBActionCount; A++) Frame.Pressed[A] = false;
				Frame.LookX = Frame.LookY = 0.f;
			}
			Step(S);
			if (Mode == ELBMode::Playing) StepPlaying(S, Frame);
			else if (Mode == ELBMode::Dialogue || Mode == ELBMode::Cutscene)
			{
				if (Mode == ELBMode::Dialogue) HandleDialogueUiInput(Frame);
				else StepCutscene(S, Frame);
				for (TUniquePtr<FLBNpc>& N : Npcs) N->Update(S, Player->Pos);
				Player->Update(S, Frame, Cam.Yaw);
				if (Companion) Companion->Update(S);
				CameraStep(S, 0.f, 0.f);
				if (Area) Area->Animate(Time);
				Time += S;
			}
			else if (Mode == ELBMode::Dead)
			{
				DeathT += S;
				Player->Update(S, Frame, Cam.Yaw);
				for (int32 I = 0; I < Enemies.Num(); I++) Enemies[I]->Update(S);
				CameraStep(S, 0.f, 0.f);
				Time += S;
				if (DeathT > 1.6f && !bDeathShown)
				{
					bDeathShown = true;
					bShowHud = false;
					OpenScreen(TEXT("death"));
				}
			}
			else if (Mode == ELBMode::Title)
			{
				Time += S;
				Cam.Yaw += S * 0.05f;
				CameraStep(S, 0.f, 0.f);
				if (Area) Area->Animate(Time);
				for (TUniquePtr<FLBNpc>& N : Npcs) N->Update(S, Player->Pos);
			}
			Remaining -= S;
			bFirst = false;
		}
	}
	UpdatePresentation(Dt);
}

void FLBGame::Step(float Dt)
{
	// Timed captions (boss intro lines are staggered).
	for (int32 I = CaptionQueue.Num() - 1; I >= 0; I--)
	{
		CaptionQueue[I].T -= Dt;
		if (CaptionQueue[I].T <= 0.f)
		{
			Caption(CaptionQueue[I].Text, CaptionQueue[I].Speaker, CaptionQueue[I].Seconds);
			CaptionQueue.RemoveAt(I);
		}
	}
	if (MusicResumeT > 0.f)
	{
		MusicResumeT -= Dt;
		if (MusicResumeT <= 0.f && Area && Area->Data && Audio) Audio->PlayMusic(Area->Data->Music);
	}
}

void FLBGame::CameraStep(float Dt, float LookX, float LookY)
{
	FLBEnemy* Lock = Player ? Player->LockTarget : nullptr;
	const float Extra = Mode == ELBMode::Cutscene ? 7.f : bBossActive ? 2.2f : 0.f;
	FVector LockPos = Lock ? Lock->Pos : FVector::ZeroVector;
	Cam.Update(Dt, LookX, LookY, Player->Pos, Lock ? &LockPos : nullptr, Area, Extra);
	if (Audio) Audio->SetListener(Player->Pos.X, Player->Pos.Z, Cam.Yaw);
}

void FLBGame::StepPlaying(float RawDt, const FLBInputFrame& F)
{
	if (!Area) return;
	RefreshStats();
	Data.PlayTime += RawDt;
	if (HandleGlobalInput(F)) return;

	float Dt = RawDt;
	if (SlowmoT > 0.f)
	{
		SlowmoT -= RawDt;
		Dt = RawDt * 0.35f;
	}
	CameraStep(RawDt, F.LookX, F.LookY);
	Area->Animate(Time);
	if (HitstopT > 0.f)
	{
		HitstopT -= RawDt;
		return;
	}
	Time += Dt;

	Player->Update(Dt, F, Cam.Yaw);
	// Buffer the interact button briefly so it isn't lost during an attack's recovery.
	if (F.WasPressed(ELBAction::Interact)) InteractBufferT = 0.4f;
	InteractBufferT -= Dt;
	if (InteractBufferT > 0.f && Player->State == TEXT("normal") && InteractKind != EInteract::None)
	{
		InteractBufferT = 0.f;
		DoInteract();
		if (Mode != ELBMode::Playing) return;
	}

	// Index loop: summons may append enemies during the update.
	for (int32 I = 0; I < Enemies.Num(); I++) Enemies[I]->Update(Dt);
	SeparateEnemies();
	for (int32 I = Enemies.Num() - 1; I >= 0; I--)
	{
		if (!Enemies[I]->bRemoved) continue;
		RemoveEnemyRefs(Enemies[I].Get());
		Enemies.RemoveAt(I);
	}
	UpdateRespawns(Dt);
	if (Companion) Companion->Update(Dt);
	Projectiles->Update(Dt);
	Hazards->Update(Dt);
	for (const FLBPickupContent& C : Pickups->Update(Dt, Player->Pos)) Collect(C);
	for (TUniquePtr<FLBNpc>& N : Npcs) N->Update(Dt, Player->Pos);

	// One-time tutorial hint for spirit abilities.
	if (FLBRules::GetFlag(Data, TEXT("hint_ability")) <= 0 && Player->Family && Player->Spirit >= Player->Family->Ability.Cost)
	{
		FLBRules::SetFlag(Data, TEXT("hint_ability"));
		Toast(FString::Printf(TEXT("Spirit is ready! Press %s to use %s."), *Prompt(ELBAction::Ability), *Player->Family->Ability.Name), TEXT("quest"));
	}
	CheckExits(Dt);
	if (Mode != ELBMode::Playing || !Area) return;
	CheckMarkers();
	CheckBossTrigger();
	UpdateInteraction();
	UpdateCombatMusic();
	if (Data.Coins < 0) Data.Coins = 0;
}

bool FLBGame::HandleGlobalInput(const FLBInputFrame& F)
{
	if (F.WasPressed(ELBAction::Pause))
	{
		OpenPause();
		return true;
	}
	if (F.WasPressed(ELBAction::Inventory))
	{
		OpenMenu(TEXT("inventory"));
		return true;
	}
	if (F.WasPressed(ELBAction::QuestLog))
	{
		OpenMenu(TEXT("quests"));
		return true;
	}
	FLBPlayer& P = *Player;
	if (Settings().bLockOnHold)
	{
		if (F.IsDown(ELBAction::LockOn) && !P.LockTarget) AcquireLock();
		if (!F.IsDown(ELBAction::LockOn) && P.LockTarget) P.LockTarget = nullptr;
	}
	else if (F.WasPressed(ELBAction::LockOn))
	{
		if (P.LockTarget) P.LockTarget = nullptr;
		else AcquireLock();
	}
	if (F.WasPressed(ELBAction::TargetNext) && P.LockTarget) CycleLock();
	return false;
}

TArray<TPair<FLBEnemy*, float>> FLBGame::LockCandidates(TArray<float>* OutAngles)
{
	TArray<TPair<FLBEnemy*, float>> Out;
	TArray<float> Angles;
	const FVector& P = Player->Pos;
	for (const TUniquePtr<FLBEnemy>& E : Enemies)
	{
		if (!E->Alive() || !E->bTargetable) continue;
		const float Dd = FVector::Dist(E->Pos, P);
		if (Dd > 24.f) continue;
		const float Ang = AngleDiff(Cam.Yaw, YawTo(P.X, P.Z, E->Pos.X, E->Pos.Z));
		if (FMath::Abs(Ang) > 1.4f && Dd > 4.f) continue;
		Out.Add(TPair<FLBEnemy*, float>(E.Get(), FMath::Abs(Ang) * 6.f + Dd * 0.3f));
		Angles.Add(Ang);
	}
	if (OutAngles)
	{
		// Sort by angle (for cycling).
		TArray<int32> Idx;
		for (int32 I = 0; I < Out.Num(); I++) Idx.Add(I);
		Idx.Sort([&](int32 A, int32 B) { return Angles[A] < Angles[B]; });
		TArray<TPair<FLBEnemy*, float>> Sorted;
		for (const int32 I : Idx)
		{
			Sorted.Add(Out[I]);
			OutAngles->Add(Angles[I]);
		}
		return Sorted;
	}
	Out.Sort([](const TPair<FLBEnemy*, float>& A, const TPair<FLBEnemy*, float>& B) { return A.Value < B.Value; });
	return Out;
}

bool FLBGame::AcquireLock()
{
	const TArray<TPair<FLBEnemy*, float>> C = LockCandidates();
	if (C.Num() == 0) return false;
	Player->LockTarget = C[0].Key;
	SfxUI(TEXT("lockOn"));
	if (C[0].Key->Def.Id == TEXT("training_dummy")) QuestEvent(TEXT("tut_lockon"));
	return true;
}

void FLBGame::CycleLock()
{
	TArray<float> Angles;
	const TArray<TPair<FLBEnemy*, float>> C = LockCandidates(&Angles);
	if (C.Num() < 2) return;
	int32 I = C.IndexOfByPredicate([&](const TPair<FLBEnemy*, float>& X) { return X.Key == Player->LockTarget; });
	Player->LockTarget = C[(I + 1) % C.Num()].Key;
	SfxUI(TEXT("lockOn"));
}

void FLBGame::SeparateEnemies()
{
	FLBPlayer& P = *Player;
	for (int32 I = 0; I < Enemies.Num(); I++)
	{
		FLBEnemy& A = *Enemies[I];
		if (!A.Alive() || A.bDormant) continue;
		for (int32 J = I + 1; J < Enemies.Num(); J++)
		{
			FLBEnemy& B = *Enemies[J];
			if (!B.Alive() || B.bDormant) continue;
			const float Dx = B.Pos.X - A.Pos.X;
			const float Dz = B.Pos.Z - A.Pos.Z;
			const float Min = A.Radius + B.Radius;
			const float D2 = Dx * Dx + Dz * Dz;
			if (D2 < Min * Min && D2 > 1e-6f)
			{
				const float Dd = FMath::Sqrt(D2);
				const float Push = (Min - Dd) / 2.f;
				const float Nx = Dx / Dd, Nz = Dz / Dd;
				const float Wa = A.bBoss ? 0.1f : 1.f;
				const float Wb = B.bBoss ? 0.1f : 1.f;
				A.Pos.X -= Nx * Push * Wa;
				A.Pos.Z -= Nz * Push * Wa;
				B.Pos.X += Nx * Push * Wb;
				B.Pos.Z += Nz * Push * Wb;
			}
		}
		// Keep enemies out of the player.
		const float Dx = A.Pos.X - P.Pos.X;
		const float Dz = A.Pos.Z - P.Pos.Z;
		const float Min = A.Radius + P.Radius;
		const float D2 = Dx * Dx + Dz * Dz;
		if (D2 < Min * Min && D2 > 1e-6f)
		{
			const float Dd = FMath::Sqrt(D2);
			const float Push = Min - Dd;
			if (A.Def.Behavior == TEXT("dummy") || A.bBoss) P.MoveBy(-Dx / Dd * Push, -Dz / Dd * Push);
			else
			{
				A.Pos.X += Dx / Dd * Push * 0.6f;
				A.Pos.Z += Dz / Dd * Push * 0.6f;
				P.MoveBy(-Dx / Dd * Push * 0.4f, -Dz / Dd * Push * 0.4f);
			}
		}
	}
}

void FLBGame::UpdateRespawns(float Dt)
{
	for (int32 I = RespawnQueue.Num() - 1; I >= 0; I--)
	{
		RespawnQueue[I].Value -= Dt;
		if (RespawnQueue[I].Value > 0.f) continue;
		const FLBEnemySpawn S = RespawnQueue[I].Key;
		RespawnQueue.RemoveAt(I);
		if (FLBEnemy* E = SpawnEnemy(S.Enemy, S.X, S.Z, S.Level))
		{
			E->SpawnId = S.Id;
			E->Yaw = UE_PI;
			FLBBurst B;
			B.Count = 10;
			B.Color = 0xd8bf72;
			B.Speed = 2.f;
			B.Life = 0.5f;
			B.Size = 1;
			Fx->Burst(S.X, E->Pos.Y + 1.f, S.Z, B);
		}
	}
}

void FLBGame::UpdateCombatMusic()
{
	bool bCombat = false;
	for (const TUniquePtr<FLBEnemy>& E : Enemies)
	{
		if (E->Alive() && E->bAggro && E->Def.Behavior != TEXT("dummy") && FVector::Dist(E->Pos, Player->Pos) < 25.f)
		{
			bCombat = true;
			break;
		}
	}
	bInCombat = bCombat;
	if (Audio) Audio->SetCombat(bCombat);
}

// =================================================================== Kills, loot, XP

void FLBGame::RemoveEnemyRefs(FLBEnemy* E)
{
	if (Player && Player->LockTarget == E) Player->LockTarget = nullptr;
	if (Companion) Companion->ForgetTarget(E);
	if (Boss == E) Boss = nullptr;
	if (BossBar == E) BossBar = nullptr;
}

void FLBGame::KillEnemy(FLBEnemy& E)
{
	E.Die();
	if (Player->LockTarget == &E)
	{
		Player->LockTarget = nullptr;
		if (!Settings().bLockOnHold && !E.bBoss) AcquireLock();
	}
	Sfx(TEXT("enemyDie"), E.Pos.X, E.Pos.Z);
	Fx->DeathPuff(E.Pos.X, E.Pos.Y, E.Pos.Z, E.bBoss ? 0xffd27a : 0x9a8ab0);
	Data.Kills++;
	{
		TArray<FLBQuestUpdate> U;
		FLBRules::Notify(*D, Data, Rng, TEXT("kill"), E.Def.Id, FString(), U);
		HandleQuestUpdates(U);
	}
	if (E.Def.Id == TEXT("training_dummy"))
	{
		for (const FLBEnemySpawn& S : Area->Data->Enemies)
		{
			if (S.Id == E.SpawnId && S.Respawn > 0.f) RespawnQueue.Add(TPair<FLBEnemySpawn, float>(S, S.Respawn));
		}
		return;
	}
	Player->Spirit = FMath::Min(Stats().MaxSpirit, Player->Spirit + 8.f * (1.f + Stats().SpiritGain));
	GrantXp(E.bSummoned ? FMath::RoundToInt(E.Xp * 0.5f) : E.Xp);
	int32 Coins = 0;
	TArray<FLBItemRef> Items;
	TArray<FLBItemInstance> Equipment;
	FLBRules::RollEnemyDrops(*D, E.Def, Rng, Area->Data->Tier, E.CoinMult * (E.bSummoned ? 0.3f : 1.f), Coins, Items, Equipment);
	if (Coins > 0)
	{
		FLBPickupContent C;
		C.Kind = FLBPickupContent::Coins;
		C.Amount = Coins;
		Pickups->Spawn(C, E.Pos.X, E.Pos.Y, E.Pos.Z);
	}
	for (const FLBItemRef& It : Items)
	{
		FLBPickupContent C;
		C.Kind = FLBPickupContent::Item;
		C.Id = It.Id;
		C.Qty = It.Qty;
		Pickups->Spawn(C, E.Pos.X, E.Pos.Y, E.Pos.Z);
	}
	for (const FLBItemInstance& G2 : Equipment)
	{
		FLBPickupContent C;
		C.Kind = FLBPickupContent::Equipment;
		C.Gen = G2;
		Pickups->Spawn(C, E.Pos.X, E.Pos.Y, E.Pos.Z);
	}
	if (E.bBoss) OnBossDefeated(E);
	else if (Companion && Rng.FRand() < 0.12f) Companion->Bark(TEXT("kill"));
}

void FLBGame::GrantXp(int32 Xp)
{
	const int32 Gained = FLBRules::AddXp(Data, Xp);
	if (Xp > 0) Fx->FloatText(Player->Pos.X, Player->Pos.Y + 2.4f, Player->Pos.Z, FString::Printf(TEXT("+%d XP"), Xp), LB::Hex(0xc8a8ff), 1.f, 0.85f, false);
	if (Gained > 0)
	{
		RefreshStats();
		Player->Hp = Stats().MaxHp;
		SfxUI(TEXT("levelUp"));
		Banner(FString::Printf(TEXT("Level %d"), Data.Level), FString::Printf(TEXT("+%d skill point%s - train at the village shrine"), Gained, Gained > 1 ? TEXT("s") : TEXT("")));
		FLBBurst B;
		B.Count = 40;
		B.Color = 0xffe08a;
		B.Speed = 4.f;
		B.Life = 1.2f;
		B.Gravity = -2.f;
		B.Size = 1;
		B.Spread = 1.f;
		Fx->Burst(Player->Pos.X, Player->Pos.Y + 1.f, Player->Pos.Z, B);
	}
}

void FLBGame::Collect(const FLBPickupContent& C)
{
	if (C.Kind == FLBPickupContent::Coins)
	{
		Data.Coins += C.Amount;
		SfxUI(TEXT("coin"));
		Fx->FloatText(Player->Pos.X, Player->Pos.Y + 2.f, Player->Pos.Z, FString::Printf(TEXT("+%d"), C.Amount), LB::Hex(0xffd27a), 0.8f, 0.85f, false);
	}
	else if (C.Kind == FLBPickupContent::Item)
	{
		const int32 Before = Data.Coins;
		const int32 Added = FLBRules::AddItem(*D, Data, C.Id, C.Qty);
		SfxUI(TEXT("pickup"));
		const FLBItemDef* Def = D->Item(C.Id);
		const FString Name = Def ? Def->Name : C.Id;
		if (Added > 0) Toast(FString::Printf(TEXT("+ %s%s"), *Name, C.Qty > 1 ? *FString::Printf(TEXT(" x%d"), C.Qty) : TEXT("")), TEXT("item"));
		else Toast(FString::Printf(TEXT("%s (full) sold for %d coins"), *Name, Data.Coins - Before), TEXT("item"));
	}
	else
	{
		const int32 Before = Data.Coins;
		const int32 Added = FLBRules::AddItem(*D, Data, C.Gen.Id, 1, C.Gen.Rarity, &C.Gen.Affixes);
		Data.ItemsFound++;
		SfxUI(TEXT("chest"));
		const FLBItemDef* Def = D->Item(C.Gen.Id);
		const FString Name = LBUi::RarityName(C.Gen.Rarity) + TEXT(" ") + (Def ? Def->Name : C.Gen.Id);
		Toast(Added > 0 ? TEXT("Found: ") + Name : FString::Printf(TEXT("Bag full - %s sold for %d coins"), *Name, Data.Coins - Before), FString::Printf(TEXT("rarity%d"), C.Gen.Rarity));
	}
	TArray<FLBQuestUpdate> U;
	FLBRules::CheckCollect(*D, Data, Rng, U);
	HandleQuestUpdates(U);
}

// =================================================================== Quests

void FLBGame::HandleQuestUpdates(const TArray<FLBQuestUpdate>& Updates)
{
	for (const FLBQuestUpdate& U : Updates)
	{
		switch (U.Kind)
		{
		case FLBQuestUpdate::Started:
			Toast(U.Text, TEXT("quest"));
			SfxUI(TEXT("questUpdate"));
			AfterQuestStart(U.QuestId);
			break;
		case FLBQuestUpdate::Progress:
			Toast(U.Text, TEXT("progress"));
			break;
		case FLBQuestUpdate::Objective:
			Toast(U.Text, TEXT("quest"));
			SfxUI(TEXT("questUpdate"));
			break;
		case FLBQuestUpdate::Completed:
		{
			FString Sub = U.Text;
			Sub.RemoveFromStart(TEXT("Quest Complete: "));
			Banner(TEXT("Quest Complete"), Sub);
			SfxUI(TEXT("questComplete"));
			if (U.LevelsGained > 0)
			{
				RefreshStats();
				if (Player) Player->Hp = Stats().MaxHp;
				SfxUI(TEXT("levelUp"));
				Toast(FString::Printf(TEXT("Level up! You are now level %d."), Data.Level), TEXT("quest"));
			}
			if (Area) Area->RefreshDynamic(Data);
			Autosave();
			break;
		}
		}
	}
	if (Updates.Num() > 0) RefreshNpcMarkers();
}

void FLBGame::AfterQuestStart(const FString& Id)
{
	if (Id == TEXT("mq_oath"))
	{
		// Equip the bow in the second weapon slot so the swap tutorial works.
		for (const FLBItemInstance& I : Data.Inventory)
		{
			if (I.Id == TEXT("bow_willow") && Data.Weapon2.IsEmpty()) FLBRules::Equip(*D, Data, I.Uid, TEXT("weapon2"));
		}
	}
}

// =================================================================== Areas

void FLBGame::NewGame()
{
	HideAllScreens();
	TArray<FLBQuestUpdate> U;
	Rng.Initialize(int32(FDateTime::Now().GetTicks() & 0xffff) + 13);
	Data = FLBRules::NewGame(*D, Rng, U);
	Data.ActiveWeapon = 0;
	RefreshStats();
	Player->Hp = Stats().MaxHp;
	Player->Stamina = Stats().MaxStamina;
	Player->Spirit = 0.f;
	Player->bSecondWindUsed = false;
	Mode = ELBMode::Playing;
	EnterArea(TEXT("village"), TEXT("start"));
	HandleQuestUpdates(U);
	PC->ClearAll();
	PC->SetMenuMode(false);
	bShowHud = true;
	Banner(TEXT("Akari Village"), TEXT("The Spirit Lantern on Hinoyama has gone dark."));
	ShowControlsHint();
	Autosave();
}

bool FLBGame::LoadSlot(const FString& Slot)
{
	FLBGameData Loaded;
	TArray<FString> Warnings;
	FString Error;
	if (!LBSaves::Load(Slot, Loaded, Warnings, Error))
	{
		Toast(TEXT("Could not load: ") + Error, TEXT("error"));
		SfxUI(TEXT("uiError"));
		return false;
	}
	Warnings.Append(FLBRules::Sanitize(*D, Loaded));
	Data = Loaded;
	RefreshStats();
	Player->Hp = FMath::Max(1.f, FMath::RoundToFloat(Stats().MaxHp * Data.HpFrac));
	Player->Spirit = Data.Spirit;
	Player->Stamina = Stats().MaxStamina;
	Player->bSecondWindUsed = false;
	HideAllScreens();
	Mode = ELBMode::Playing;
	EnterArea(Data.Area, Data.Spawn, Data.bHasPos);
	PC->ClearAll();
	PC->SetMenuMode(false);
	bShowHud = true;
	for (const FString& W : Warnings) Toast(W, TEXT("error"));
	Toast(Slot == TEXT("auto") ? FString(TEXT("Loaded autosave")) : FString::Printf(TEXT("Loaded slot %s"), *Slot), TEXT("info"));
	return true;
}

void FLBGame::EnterArea(const FString& Id, const FString& SpawnId, bool bUseSavedPos)
{
	ClearEntities();
	if (Area) Area->Destroy();
	Area = nullptr;
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Area = World->SpawnActor<ALBArea>(ALBArea::StaticClass(), FTransform::Identity, Params);
	FString Error;
	if (!Area || !Area->Build(Id, Data, Error))
	{
		FatalError = FString::Printf(TEXT("Could not load area '%s': %s"), *Id, *Error);
		UE_LOG(LogLanternbound, Error, TEXT("%s"), *FatalError);
		Mode = ELBMode::Error;
		OpenScreen(TEXT("error"));
		return;
	}
	const FLBAreaData& A = *Area->Data;
	const FLBSpawnDef* Spawn = A.FindSpawn(SpawnId);
	FString UsedSpawn = SpawnId;
	if (!Spawn)
	{
		Spawn = A.FindSpawn(TEXT("shrine"));
		UsedSpawn = TEXT("shrine");
	}
	if (!Spawn && A.Spawns.Num() > 0)
	{
		Spawn = &A.Spawns[0];
		UsedSpawn = Spawn->Id;
	}
	FLBSpawnDef Fallback;
	if (!Spawn) Spawn = &Fallback;
	Data.Area = Id;
	Data.Spawn = UsedSpawn;
	const float Px = bUseSavedPos ? Data.PosX : Spawn->X;
	const float Pz = bUseSavedPos ? Data.PosZ : Spawn->Z;
	Player->ResetCombatState();
	Player->Place(Px, Area->GroundY(Px, Pz), Pz, Spawn->Yaw);
	Player->EquipWeapon();
	Player->SetLanternIntensity(A.Env.LanternIntensity);
	Cam.SnapBehind(Spawn->Yaw);
	Fx->SetAmbient(A.HasAmbient ? &A.Ambient : nullptr);

	for (const FLBNpcPlace& N : A.Npcs)
	{
		if (!FLBRules::EvalCond(*D, Data, N.ShowIf)) continue;
		Npcs.Add(MakeUnique<FLBNpc>(*this, N.Id, N.X, Area->GroundY(N.X, N.Z), N.Z, N.Yaw));
		Area->AddCircleCollider(N.X, N.Z, 0.5f, 2.f, TEXT("npc_") + N.Id);
	}
	RefreshNpcMarkers();
	for (const FLBEnemySpawn& S : A.Enemies)
	{
		if (FLBEnemy* E = SpawnEnemy(S.Enemy, S.X, S.Z, S.Level)) E->SpawnId = S.Id;
	}
	Boss = nullptr;
	bBossActive = false;
	if (A.HasBoss && !Data.BossesDefeated.Contains(A.Boss.Enemy))
	{
		if (FLBEnemy* B = SpawnEnemy(A.Boss.Enemy, A.Boss.X, A.Boss.Z, 1))
		{
			B->bDormant = true;
			B->Yaw = A.Boss.Yaw;
			Boss = B;
		}
	}
	SyncCompanion();
	Data.VisitedAreas.AddUnique(Id);
	if (Audio) Audio->PlayMusic(A.Music);
	Banner(A.Name, FString(), 2.8f);
	FadeT = 0.6f;
	TArray<FLBQuestUpdate> U;
	FLBRules::Notify(*D, Data, Rng, TEXT("reach"), TEXT("area:") + Id, FString(), U);
	HandleQuestUpdates(U);
	Area->RefreshDynamic(Data);
}

void FLBGame::ClearEntities()
{
	Enemies.Reset();
	Npcs.Reset();
	if (Projectiles) Projectiles->Clear();
	if (Hazards) Hazards->Clear();
	if (Pickups) Pickups->Clear();
	if (Fx) Fx->ClearTransient();
	RespawnQueue.Reset();
	CaptionQueue.Reset();
	RemoveBarrier();
	Boss = nullptr;
	BossBar = nullptr;
	if (Player) Player->LockTarget = nullptr;
	if (Companion) Companion->ForgetTarget(nullptr);
	InteractKind = EInteract::None;
	InteractNpc = nullptr;
	InteractObj = -1;
	InteractionLabel.Empty();
}

void FLBGame::SyncCompanion()
{
	const bool bWant = FLBRules::GetFlag(Data, TEXT("kohaku_joined")) > 0 && Settings().bCompanionEnabled && Mode != ELBMode::Title && Area != nullptr;
	if (bWant && !Companion)
	{
		Companion = MakeUnique<FLBCompanion>(*this);
		Companion->Place(Player->Pos.X - 1.5f, Player->Pos.Y, Player->Pos.Z - 1.5f);
	}
	else if (!bWant && Companion) Companion.Reset();
	else if (bWant && Companion) Companion->Place(Player->Pos.X - FMath::Sin(Player->Yaw) * 1.5f, Player->Pos.Y, Player->Pos.Z - FMath::Cos(Player->Yaw) * 1.5f);
}

void FLBGame::RefreshNpcMarkers()
{
	for (TUniquePtr<FLBNpc>& N : Npcs) N->Marker = FLBRules::NpcQuestMarker(*D, Data, N->Id);
}

void FLBGame::CheckExits(float Dt)
{
	LockedMsgT -= Dt;
	const FVector& P = Player->Pos;
	for (const FLBExitDef& Ex : Area->Data->Exits)
	{
		const float Dd = FMath::Sqrt(FMath::Square(P.X - Ex.X) + FMath::Square(P.Z - Ex.Z));
		if (Dd > Ex.R) continue;
		if (bBossActive) return;
		if (!FLBRules::EvalCond(*D, Data, Ex.Requires))
		{
			if (LockedMsgT <= 0.f)
			{
				Caption(Ex.LockedText.IsEmpty() ? FString(TEXT("The way is blocked.")) : Ex.LockedText, FString(), 2.5f);
				SfxUI(TEXT("uiError"));
				LockedMsgT = 2.5f;
			}
			// Nudge the player back out of the trigger.
			const float N = Dd > 0.f ? Dd : 1.f;
			Player->MoveBy((P.X - Ex.X) / N * 0.25f, (P.Z - Ex.Z) / N * 0.25f);
			return;
		}
		const FString To = Ex.To;
		const FString Spawn = Ex.Spawn;
		Travel(To, Spawn);
		return;
	}
}

void FLBGame::Travel(const FString& To, const FString& Spawn)
{
	Data.bHasPos = false;
	EnterArea(To, Spawn);
	Autosave();
}

void FLBGame::CheckMarkers()
{
	const FVector& P = Player->Pos;
	for (const FLBMarkerDef& M : Area->Data->Markers)
	{
		if (FMath::Sqrt(FMath::Square(P.X - M.X) + FMath::Square(P.Z - M.Z)) >= M.R) continue;
		// Only notify for markers that some quest is waiting on.
		for (const FLBQuestState& Q : Data.ActiveQuests)
		{
			const FLBObjective* O = FLBRules::CurrentObjective(*D, Data, Q.Id);
			if (O && O->Type == TEXT("reach") && O->Target == M.Id)
			{
				TArray<FLBQuestUpdate> U;
				FLBRules::Notify(*D, Data, Rng, TEXT("reach"), M.Id, FString(), U);
				HandleQuestUpdates(U);
				break;
			}
		}
	}
}

// =================================================================== Bosses

void FLBGame::CheckBossTrigger()
{
	FLBEnemy* B = Boss;
	if (!B || !Area->Data->HasBoss || !B->bDormant || !Player->Alive()) return;
	const FLBBossPlace& Bp = Area->Data->Boss;
	if (FMath::Sqrt(FMath::Square(Player->Pos.X - Bp.TriggerX) + FMath::Square(Player->Pos.Z - Bp.TriggerZ)) > Bp.TriggerR) return;
	bBossActive = true;
	B->StartIntro();
	// Barrier across the arena entrance (prop is a 1 m wide, 4 m tall plane; scale it).
	BarrierVisual = Area->SpawnProp(TEXT("barrier"), LB::ToWorld(Bp.GateX, Bp.GateZ, Area->GroundY(Bp.GateX, Bp.GateZ)), LB::YawToUE(Bp.GateYaw), FVector(1.f, Bp.GateWidth, 1.25f));
	Area->AddBoxCollider(Bp.GateX - Bp.GateWidth / 2.f, Bp.GateX + Bp.GateWidth / 2.f, Bp.GateZ - 0.6f, Bp.GateZ + 0.6f, 1.5f, TEXT("bossBarrier"));
	bHasBarrier = true;
	if (const FLBBossLines* L = D->BossLines.Find(B->Def.Id))
	{
		for (int32 I = 0; I < L->Intro.Num(); I++)
		{
			FTimedCaption C;
			C.T = I * 1.5f;
			C.Text = L->Intro[I];
			C.Speaker = B->Def.Name;
			C.Seconds = 2.8f;
			CaptionQueue.Add(C);
		}
	}
	Sfx(TEXT("bossRoar"), B->Pos.X, B->Pos.Z);
	if (Audio) Audio->PlayMusic(B->Def.BossMusic);
	BossBar = B;
	if (Companion) Companion->Bark(TEXT("boss"));
	Player->LockTarget = B;
}

void FLBGame::RemoveBarrier()
{
	if (!bHasBarrier) return;
	bHasBarrier = false;
	if (IsValid(BarrierVisual.Pivot))
	{
		for (UProceduralMeshComponent* M : BarrierVisual.Meshes) if (IsValid(M)) M->DestroyComponent();
		BarrierVisual.Pivot->DestroyComponent();
	}
	BarrierVisual = FLBSpawnedPart();
	if (IsValid(Area)) Area->RemoveColliders(TEXT("bossBarrier"));
}

void FLBGame::OnBossDefeated(FLBEnemy& E)
{
	const FLBEnemyDef& Def = E.Def;
	bBossActive = false;
	Data.BossesDefeated.AddUnique(Def.Id);
	if (const FLBBossLines* L = D->BossLines.Find(Def.Id)) Caption(L->Defeat, Def.Name, 3.5f);
	for (int32 I = 0; I < Enemies.Num(); I++)
	{
		FLBEnemy& O = *Enemies[I];
		if (O.bSummoned && O.Alive()) KillEnemy(O);
	}
	for (const FString& R : Def.BossReward)
	{
		const FLBItemDef* It = D->Item(R);
		if (!It) continue;
		if (It->Kind == TEXT("key")) FLBRules::AddItem(*D, Data, R);
		else
		{
			const FLBItemInstance G2 = FLBRules::GenerateEquipment(*D, R, Rng);
			FLBRules::AddItem(*D, Data, R, 1, G2.Rarity, &G2.Affixes);
		}
		Toast(TEXT("Obtained: ") + It->Name, It->Kind == TEXT("key") ? FString(TEXT("quest")) : FString::Printf(TEXT("rarity%d"), It->FixedRarity >= 0 ? It->FixedRarity : 2));
	}
	GrantXp(E.Xp);
	{
		TArray<FLBQuestUpdate> U;
		FLBRules::Notify(*D, Data, Rng, TEXT("boss"), Def.Id, FString(), U);
		HandleQuestUpdates(U);
	}
	RemoveBarrier();
	BossBar = nullptr;
	Boss = nullptr;
	Player->Hp = Stats().MaxHp;
	MusicResumeT = 3.f;
	Banner(Def.Name + TEXT(" Defeated"), Def.BossTitle);
	Autosave();
}

// =================================================================== Death

void FLBGame::OnPlayerDeath()
{
	Mode = ELBMode::Dead;
	DeathT = 0.f;
	bDeathShown = false;
	Data.Deaths++;
	SfxUI(TEXT("death"));
	BossBar = nullptr;
	PC->SetMenuMode(true);
}

void FLBGame::Respawn()
{
	HideAllScreens();
	RefreshStats();
	Player->Hp = Stats().MaxHp;
	Player->Stamina = Stats().MaxStamina;
	Player->bSecondWindUsed = false;
	Data.bHasPos = false;
	Mode = ELBMode::Playing;
	EnterArea(Data.Area, Data.Spawn);
	PC->ClearAll();
	PC->SetMenuMode(false);
	bShowHud = true;
	Toast(TEXT("You rise again at the last waypoint."), TEXT("info"));
}

// =================================================================== Interaction

void FLBGame::UpdateInteraction()
{
	const FVector& P = Player->Pos;
	InteractKind = EInteract::None;
	InteractNpc = nullptr;
	InteractObj = -1;
	InteractionLabel.Empty();
	float Bd = TNumericLimits<float>::Max();
	for (TUniquePtr<FLBNpc>& N : Npcs)
	{
		const float Dd = FVector::Dist(N->Pos, P);
		if (Dd < 2.8f && Dd < Bd)
		{
			Bd = Dd;
			InteractKind = EInteract::Npc;
			InteractNpc = N.Get();
			InteractionLabel = TEXT("Talk to ") + N->Name;
		}
	}
	for (int32 I = 0; I < Area->Interactables.Num(); I++)
	{
		const FLBInteractDef& Def = Area->Interactables[I].Def;
		const float Dd = FMath::Sqrt(FMath::Square(Def.X - P.X) + FMath::Square(Def.Z - P.Z));
		const float Range = Def.Kind == TEXT("lantern") ? 5.f : 2.6f;
		if (Dd > Range || Dd >= Bd) continue;
		if (!Area->InteractableAvailable(Def, Data)) continue;
		Bd = Dd;
		InteractKind = EInteract::Object;
		InteractNpc = nullptr;
		InteractObj = I;
		if (Def.Kind == TEXT("chest")) InteractionLabel = TEXT("Open chest");
		else if (Def.Kind == TEXT("brazier")) InteractionLabel = TEXT("Light brazier");
		else if (Def.Kind == TEXT("wayshrine")) InteractionLabel = TEXT("Rest at wayshrine");
		else if (Def.Kind == TEXT("seal")) InteractionLabel = TEXT("Break the seal");
		else InteractionLabel = TEXT("Relight the Spirit Lantern");
	}
	if (bBossActive)
	{
		InteractKind = EInteract::None;
		InteractionLabel.Empty();
	}
}

void FLBGame::DoInteract()
{
	if (Mode != ELBMode::Playing) return;
	if (InteractKind == EInteract::Npc && InteractNpc) StartDialogue(*InteractNpc);
	else if (InteractKind == EInteract::Object && Area->Interactables.IsValidIndex(InteractObj))
	{
		const FLBInteractDef Def = Area->Interactables[InteractObj].Def;
		UseObject(Def);
	}
}

void FLBGame::UseObject(const FLBInteractDef& Def)
{
	auto Burst = [this](float X, float Y, float Z, int32 Count, int32 Color, float Speed, float Life, float Gravity) {
		FLBBurst B;
		B.Count = Count;
		B.Color = Color;
		B.Speed = Speed;
		B.Life = Life;
		B.Gravity = Gravity;
		B.Size = 1;
		Fx->Burst(X, Y, Z, B);
	};
	if (Def.Kind == TEXT("chest"))
	{
		Data.OpenedChests.AddUnique(Def.Id);
		Sfx(TEXT("chest"), Def.X, Def.Z);
		if (Def.LootCoins > 0)
		{
			Data.Coins += Def.LootCoins;
			Toast(FString::Printf(TEXT("+ %d coins"), Def.LootCoins), TEXT("item"));
		}
		for (const FLBItemRef& It : Def.LootItems)
		{
			FLBRules::AddItem(*D, Data, It.Id, It.Qty);
			const FLBItemDef* ItDef = D->Item(It.Id);
			Toast(FString::Printf(TEXT("+ %s%s"), ItDef ? *ItDef->Name : *It.Id, It.Qty > 1 ? *FString::Printf(TEXT(" x%d"), It.Qty) : TEXT("")), TEXT("item"));
		}
		if (Def.LootEquipTier > 0)
		{
			FLBItemInstance G2 = FLBRules::RollEquipmentDrop(*D, Rng, Def.LootEquipTier);
			if (Def.LootRarityLuck > 0.f && G2.Rarity < 2 && Rng.FRand() < Def.LootRarityLuck)
			{
				const FLBItemInstance Better = FLBRules::GenerateEquipment(*D, G2.Id, Rng, 2);
				G2.Rarity = Better.Rarity;
				G2.Affixes = Better.Affixes;
			}
			FLBRules::AddItem(*D, Data, G2.Id, 1, G2.Rarity, &G2.Affixes);
			const FLBItemDef* ItDef = D->Item(G2.Id);
			Toast(FString::Printf(TEXT("Found: %s %s"), *LBUi::RarityName(G2.Rarity), ItDef ? *ItDef->Name : *G2.Id), FString::Printf(TEXT("rarity%d"), G2.Rarity));
		}
		Burst(Def.X, Area->GroundY(Def.X, Def.Z) + 0.8f, Def.Z, 24, 0xffd27a, 3.f, 0.8f, -1.f);
		Area->RefreshDynamic(Data);
		TArray<FLBQuestUpdate> U;
		FLBRules::CheckCollect(*D, Data, Rng, U);
		HandleQuestUpdates(U);
	}
	else if (Def.Kind == TEXT("brazier"))
	{
		Data.LitBraziers.AddUnique(Def.Id);
		Sfx(TEXT("brazier"), Def.X, Def.Z);
		Burst(Def.X, Area->GroundY(Def.X, Def.Z) + 2.f, Def.Z, 30, 0x6fd8ff, 4.f, 1.f, -3.f);
		{
			TArray<FLBQuestUpdate> U;
			FLBRules::Notify(*D, Data, Rng, TEXT("interact"), TEXT("brazier"), FString(), U);
			HandleQuestUpdates(U);
		}
		int32 Lit = 0;
		for (const FString& B : Data.LitBraziers) Lit += B.StartsWith(TEXT("brazier_")) ? 1 : 0;
		if (Lit >= 3 && FLBRules::GetFlag(Data, TEXT("catacombs_open")) <= 0)
		{
			FLBRules::SetFlag(Data, TEXT("catacombs_open"));
			Caption(TEXT("Far to the north-east, stone doors grind open."), FString(), 3.5f);
			SfxUI(TEXT("door"));
		}
		else Caption(FString::Printf(TEXT("A spirit brazier burns again. (%d/3)"), Lit), FString(), 2.5f);
		Area->RefreshDynamic(Data);
		Autosave();
	}
	else if (Def.Kind == TEXT("seal"))
	{
		FLBRules::SetFlag(Data, Def.Id);
		Sfx(TEXT("brazier"), Def.X, Def.Z);
		Burst(Def.X, Area->GroundY(Def.X, Def.Z) + 1.6f, Def.Z, 30, 0x8ad8ff, 4.f, 1.f, 0.f);
		const bool bBoth = FLBRules::GetFlag(Data, TEXT("seal_east")) > 0 && FLBRules::GetFlag(Data, TEXT("seal_west")) > 0;
		Caption(bBoth ? TEXT("Somewhere ahead, a great door groans open.") : TEXT("The seal shatters. One more remains."), FString(), 3.f);
		if (bBoth) SfxUI(TEXT("door"));
		Area->RefreshDynamic(Data);
	}
	else if (Def.Kind == TEXT("wayshrine"))
	{
		OpenMenu(TEXT("wayshrine"));
	}
	else if (Def.Kind == TEXT("lantern"))
	{
		StartEnding();
	}
}

void FLBGame::Rest()
{
	RefreshStats();
	Player->Hp = Stats().MaxHp;
	Player->Stamina = Stats().MaxStamina;
	Player->BurnT = 0.f;
	Player->bSecondWindUsed = false;
	const FString Spawn = Area->Data->FindSpawn(TEXT("shrine")) ? FString(TEXT("shrine")) : Data.Spawn;
	Data.bHasPos = false;
	HideAllScreens();
	Mode = ELBMode::Playing;
	EnterArea(Area->Data->Id, Spawn);
	Data.Spawn = Spawn;
	SfxUI(TEXT("heal"));
	Autosave();
	PC->ClearAll();
	PC->SetMenuMode(false);
	bShowHud = true;
	Toast(TEXT("Rested. Health restored and progress saved. The Hollowed stir again..."), TEXT("info"));
}

void FLBGame::FastTravel(const FString& To)
{
	Data.bHasPos = false;
	HideAllScreens();
	Mode = ELBMode::Playing;
	EnterArea(To, TEXT("shrine"));
	Data.Spawn = TEXT("shrine");
	Autosave();
	PC->ClearAll();
	PC->SetMenuMode(false);
	bShowHud = true;
}

// =================================================================== Dialogue

void FLBGame::StartDialogue(FLBNpc& Npc)
{
	const FLBNpcDialogueEntry* Entry = FLBRules::SelectDialogue(*D, Data, Npc.Id);
	if (!Entry || !Runner.Start(*D, Entry->Dialogue)) return;
	DialogueNpc = &Npc;
	DialogueEntry = *Entry;
	Deferred.Reset();
	Npc.bTalking = true;
	Mode = ELBMode::Dialogue;
	Player->Freeze();
	Player->LockTarget = nullptr;
	Player->Yaw = YawTo(Player->Pos.X, Player->Pos.Z, Npc.Pos.X, Npc.Pos.Z);
	PC->SetMenuMode(true);
	RunDialogueActions();
	ShowDialogueNode();
}

void FLBGame::ShowDialogue(const FString& Speaker, const FString& Text, const TArray<FString>& Choices, bool bCinematic)
{
	bDialogueOpen = true;
	bDialogueCinematic = bCinematic;
	DialogueSpeaker = Speaker;
	DialogueText = Text;
	DialogueShown = 0.f;
	DialogueChoices = Choices;
	ChoiceFocus = 0;
	bShowHud = false;
}

void FLBGame::HideDialogue()
{
	bDialogueOpen = false;
	DialogueChoices.Reset();
	if (Mode == ELBMode::Playing) bShowHud = true;
}

void FLBGame::ShowDialogueNode()
{
	const FLBDialogueNode* Node = Runner.Node();
	if (!Node)
	{
		EndDialogue();
		return;
	}
	const FString Name = Node->Speaker == TEXT("warden") ? FString(TEXT("You")) : D->NpcName(Node->Speaker);
	TArray<FString> Choices;
	for (const FLBDialogueChoice* C : Runner.VisibleChoices(*D, Data)) Choices.Add(C->Text);
	ShowDialogue(Name, Node->Text, Choices, false);
}

void FLBGame::HandleDialogueUiInput(const FLBInputFrame& F)
{
	if (Mode != ELBMode::Dialogue || DialogueChoices.Num() > 0) return; // choices use menu navigation
	if (F.WasPressed(ELBAction::Interact) || F.WasPressed(ELBAction::Attack) || F.WasPressed(ELBAction::Dodge)) AdvanceDialogue();
}

void FLBGame::AdvanceDialogue()
{
	if (Mode != ELBMode::Dialogue) return;
	if (DialogueTyping())
	{
		DialogueShown = DialogueText.Len();
		return;
	}
	Runner.Advance(*D, Data);
	SfxUI(TEXT("uiMove"));
	RunDialogueActions();
	ShowDialogueNode();
}

void FLBGame::ChooseDialogue(int32 Index)
{
	if (Mode != ELBMode::Dialogue) return;
	if (DialogueTyping())
	{
		DialogueShown = DialogueText.Len();
		return;
	}
	Runner.Choose(*D, Data, Index);
	// The key that picked the choice must not also advance the next line.
	if (PC) PC->ClearAll();
	SfxUI(TEXT("uiConfirm"));
	RunDialogueActions();
	ShowDialogueNode();
}

void FLBGame::RunDialogueActions()
{
	for (const FString& A : Runner.TakeActions())
	{
		TArray<FString> Parts;
		A.ParseIntoArray(Parts, TEXT(":"), false);
		const FString Kind = Parts.Num() > 0 ? Parts[0] : FString();
		const FString Arg = Parts.Num() > 1 ? Parts[1] : FString();
		const int32 Qty = Parts.Num() > 2 ? FMath::Max(1, FCString::Atoi(*Parts[2])) : 1;
		if (Kind == TEXT("startQuest"))
		{
			TArray<FLBQuestUpdate> U;
			FLBRules::StartQuest(*D, Data, Rng, Arg, U);
			HandleQuestUpdates(U);
		}
		else if (Kind == TEXT("give"))
		{
			FLBRules::AddItem(*D, Data, Arg, Qty);
			const FLBItemDef* Def = D->Item(Arg);
			Toast(TEXT("Received: ") + (Def ? Def->Name : Arg), TEXT("item"));
		}
		else if (Kind == TEXT("take")) FLBRules::RemoveItem(Data, Arg, Qty);
		else if (Kind == TEXT("flag"))
		{
			FLBRules::SetFlag(Data, Arg);
			if (Arg == TEXT("kohaku_joined")) Toast(TEXT("Kohaku the fox spirit joins you!"), TEXT("quest"));
			if (Arg == TEXT("blessing")) Toast(TEXT("The summit path is now open."), TEXT("quest"));
		}
		else if (Kind == TEXT("heal"))
		{
			Player->Hp = Stats().MaxHp;
			SfxUI(TEXT("heal"));
		}
		else if (Kind == TEXT("rest") || Kind == TEXT("open")) Deferred.Add(A);
	}
}

void FLBGame::EndDialogue()
{
	FLBNpc* Npc = DialogueNpc;
	DialogueNpc = nullptr;
	if (Npc) Npc->bTalking = false;
	Mode = ELBMode::Playing;
	Player->Unfreeze();
	HideDialogue();
	PC->ClearAll();
	PC->SetMenuMode(false);
	if (Npc && !DialogueEntry.NoTalk)
	{
		TArray<FLBQuestUpdate> U;
		FLBRules::Notify(*D, Data, Rng, TEXT("talk"), Npc->Id, DialogueEntry.Quest, U);
		HandleQuestUpdates(U);
	}
	if (Npc)
	{
		// Hotaru crosses over once she has given you her bell.
		if (Npc->Id == TEXT("hotaru") && FLBRules::GetFlag(Data, TEXT("hotaru_saved")) > 0) RemoveNpc(Npc, 0x9fd8ff);
		else if (Npc->Id == TEXT("kohaku") && FLBRules::GetFlag(Data, TEXT("kohaku_joined")) > 0)
		{
			RemoveNpc(Npc, 0xffd27a);
			Area->RefreshDynamic(Data);
			SyncCompanion();
		}
	}
	RefreshNpcMarkers();
	const TArray<FString> Todo = Deferred;
	Deferred.Reset();
	for (const FString& A : Todo)
	{
		if (A == TEXT("rest")) Rest();
		else if (A.StartsWith(TEXT("open:"))) OpenMenu(A.Mid(5));
	}
}

void FLBGame::RemoveNpc(FLBNpc* Npc, int32 Color)
{
	FLBBurst B;
	B.Count = 30;
	B.Color = Color;
	B.Speed = 3.f;
	B.Life = 1.2f;
	B.Gravity = -2.f;
	B.Size = 1;
	Fx->Burst(Npc->Pos.X, Npc->Pos.Y + 1.f, Npc->Pos.Z, B);
	Area->RemoveColliders(TEXT("npc_") + Npc->Id);
	if (InteractNpc == Npc)
	{
		InteractNpc = nullptr;
		InteractKind = EInteract::None;
	}
	Npcs.RemoveAll([Npc](const TUniquePtr<FLBNpc>& N) { return N.Get() == Npc; });
}

// =================================================================== Ending

void FLBGame::StartEnding()
{
	{
		TArray<FLBQuestUpdate> U;
		FLBRules::Notify(*D, Data, Rng, TEXT("interact"), TEXT("lantern"), FString(), U);
		HandleQuestUpdates(U);
	}
	Data.bEnding = true;
	FLBRules::SetFlag(Data, TEXT("lantern_lit"));
	for (const TCHAR* Id : {TEXT("ember_core_1"), TEXT("ember_core_2"), TEXT("ember_core_3")}) FLBRules::RemoveItem(Data, Id, 1);
	Area->SetLanternLit(true);
	Area->RefreshDynamic(Data);
	// Every remaining Hollowed remembers itself and crosses over.
	for (TUniquePtr<FLBEnemy>& E : Enemies)
	{
		if (!E->Alive()) continue;
		FLBBurst B;
		B.Count = 30;
		B.Color = 0xbfe8ff;
		B.Speed = 3.f;
		B.Life = 1.6f;
		B.Gravity = -3.f;
		B.Size = 1;
		Fx->Burst(E->Pos.X, E->Pos.Y + 1.f, E->Pos.Z, B);
		E->Die();
	}
	Projectiles->Clear();
	Hazards->Clear();
	Fx->ClearTransient();
	Captions.Reset();
	CaptionQueue.Reset();
	if (Audio) Audio->PlayMusic(TEXT("ending"));
	Mode = ELBMode::Cutscene;
	Player->Freeze();
	Player->LockTarget = nullptr;
	EndingIndex = -1;
	EndingT = 99.f;
	// Frame the relit Lantern: look up at it from behind the Warden.
	Cam.Yaw = YawTo(Player->Pos.X, Player->Pos.Z, 0.f, 74.f);
	Cam.Pitch = -0.05f;
	bShowHud = false;
	PC->SetMenuMode(true);
	FLBBurst B;
	B.Count = 120;
	B.Color = 0xffd27a;
	B.Speed = 10.f;
	B.Life = 2.5f;
	B.Gravity = -1.f;
	B.Size = 1;
	Fx->Burst(0.f, Area->GroundY(0.f, 74.f) + 8.4f, 74.f, B);
	Shake(0.6f);
	Autosave();
}

void FLBGame::StepCutscene(float Dt, const FLBInputFrame& F)
{
	EndingT += Dt;
	Cam.Yaw += Dt * 0.04f;
	const bool bSkip = F.WasPressed(ELBAction::Interact) || F.WasPressed(ELBAction::Attack) || F.WasPressed(ELBAction::Pause);
	if (EndingT > 5.f || (bSkip && EndingT > 0.4f))
	{
		EndingIndex++;
		EndingT = 0.f;
		if (EndingIndex >= D->Ending.Num())
		{
			HideDialogue();
			Mode = ELBMode::Credits;
			TMap<FString, FString> Opts;
			Opts.Add(TEXT("ending"), TEXT("1"));
			OpenScreen(TEXT("credits"), Opts);
			return;
		}
		const FLBLine& L = D->Ending[EndingIndex];
		ShowDialogue(L.Speaker.IsEmpty() ? FString() : D->NpcName(L.Speaker), L.Text, {}, true);
	}
	if (Rng.FRand() < 0.3f)
	{
		const float A = Rng.FRand() * UE_PI * 2.f;
		FLBBurst B;
		B.Count = 2;
		B.Color = 0xbfe8ff;
		B.Speed = 0.5f;
		B.Life = 3.f;
		B.Gravity = -2.f;
		B.Size = 1;
		Fx->Burst(FMath::Cos(A) * 20.f, Player->Pos.Y + 1.f, 58.f + FMath::Sin(A) * 20.f, B);
	}
}

void FLBGame::ContinueAfterEnding()
{
	HideAllScreens();
	Mode = ELBMode::Playing;
	Player->Unfreeze();
	EnterArea(TEXT("village"), TEXT("from_summit"));
	PC->ClearAll();
	PC->SetMenuMode(false);
	bShowHud = true;
	Autosave();
}

// =================================================================== Menus & services

void FLBGame::OpenPause()
{
	if (Mode != ELBMode::Playing) return;
	Mode = ELBMode::Paused;
	PC->ClearAll();
	OpenScreen(TEXT("pause"));
	SfxUI(TEXT("uiConfirm"));
}

void FLBGame::OpenMenu(const FString& Name)
{
	if (Mode != ELBMode::Playing && Mode != ELBMode::Paused) return;
	Mode = ELBMode::Menu;
	PC->ClearAll();
	OpenScreen(Name);
	SfxUI(TEXT("uiConfirm"));
}

void FLBGame::ResumePlay()
{
	if (Mode == ELBMode::Paused || Mode == ELBMode::Menu)
	{
		Mode = ELBMode::Playing;
		PC->ClearAll();
		PC->SetMenuMode(false);
		RefreshStats();
		RefreshNpcMarkers();
		bShowHud = true;
	}
}

void FLBGame::QuitToTitle()
{
	HideAllScreens();
	HideDialogue();
	ClearEntities();
	Companion.Reset();
	bBossActive = false;
	Boss = nullptr;
	ShowTitleScene();
}

void FLBGame::ShowTitleScene()
{
	Mode = ELBMode::Title;
	Data = FLBGameData();
	EnterArea(TEXT("village"), TEXT("start"));
	if (Mode == ELBMode::Error) return;
	Mode = ELBMode::Title;
	Player->Place(0.f, Area->GroundY(0.f, 6.f), 6.f, UE_PI);
	Player->SetVisible(false);
	Cam.SnapBehind(UE_PI * 0.85f);
	Cam.Pitch = 0.12f;
	if (Audio) Audio->PlayMusic(TEXT("title"));
	bShowHud = false;
	BannerT = 0.f;
	Toasts.Reset();
	PC->SetMenuMode(true);
	OpenScreen(TEXT("title"));
}

bool FLBGame::EquipItem(const FString& Uid, const FString& Slot)
{
	const bool bOk = FLBRules::Equip(*D, Data, Uid, Slot);
	if (bOk) AfterEquipChange();
	return bOk;
}

bool FLBGame::UnequipSlot(const FString& Slot)
{
	const bool bOk = FLBRules::Unequip(Data, Slot);
	if (bOk) AfterEquipChange();
	return bOk;
}

void FLBGame::AfterEquipChange()
{
	if (Data.ActiveWeapon == 1 && Data.Weapon2.IsEmpty()) Data.ActiveWeapon = 0;
	Player->EquipWeapon();
	RefreshStats();
	SfxUI(TEXT("swap"));
}

bool FLBGame::UseItem(const FString& Uid)
{
	const FLBItemInstance* Inst = FLBRules::FindItemConst(Data, Uid);
	const FLBItemDef* Def = Inst ? D->Item(Inst->Id) : nullptr;
	if (!Inst || !Def || (Def->UseHeal <= 0.f && Def->UseSpirit <= 0.f && Def->UseBuffAtk <= 0.f)) return false;
	if (Def->UseHeal > 0.f)
	{
		if (Player->Hp >= Stats().MaxHp)
		{
			Toast(TEXT("Already at full health."), TEXT("info"));
			return false;
		}
		const float Mult = FLBRules::HasSpecial(*D, Data, TEXT("teaMastery")) ? 1.5f : 1.f;
		Player->Hp = FMath::Min(Stats().MaxHp, Player->Hp + Stats().MaxHp * Def->UseHeal * Mult);
	}
	if (Def->UseSpirit > 0.f) Player->Spirit = FMath::Min(Stats().MaxSpirit, Player->Spirit + Def->UseSpirit);
	if (Def->UseBuffAtk > 0.f)
	{
		Player->BuffAtk = Def->UseBuffAtk;
		Player->BuffT = Def->UseBuffTime > 0.f ? Def->UseBuffTime : 30.f;
	}
	const FString Name = Def->Name;
	FLBRules::RemoveItem(Data, Uid, 1);
	SfxUI(TEXT("heal"));
	Toast(TEXT("Used ") + Name, TEXT("info"));
	return true;
}

TArray<const FLBShopEntry*> FLBGame::ShopStock() const
{
	TArray<const FLBShopEntry*> Out;
	for (const FLBShopEntry& S : D->Shop)
	{
		if (!FLBRules::EvalCond(*D, Data, S.Requires)) continue;
		if (S.Once && FLBRules::GetFlag(Data, TEXT("bought_") + S.Item) > 0) continue;
		Out.Add(&S);
	}
	return Out;
}

bool FLBGame::BuyItem(const FString& ItemId)
{
	const FLBShopEntry* Entry = D->Shop.FindByPredicate([&](const FLBShopEntry& S) { return S.Item == ItemId; });
	const FLBItemDef* Def = D->Item(ItemId);
	if (!Entry || !Def) return false;
	bool bOk;
	if (Def->IsEquipment())
	{
		if (Data.Coins < Entry->Price) bOk = false;
		else
		{
			Data.Coins -= Entry->Price;
			const FLBItemInstance G2 = FLBRules::GenerateEquipment(*D, ItemId, Rng, FMath::Max(0, Entry->Rarity));
			FLBRules::AddItem(*D, Data, ItemId, 1, G2.Rarity, &G2.Affixes);
			if (Entry->Once) FLBRules::SetFlag(Data, TEXT("bought_") + ItemId);
			bOk = true;
		}
	}
	else bOk = FLBRules::Buy(*D, Data, ItemId, Entry->Price);
	SfxUI(bOk ? TEXT("coin") : TEXT("uiError"));
	if (bOk)
	{
		TArray<FLBQuestUpdate> U;
		FLBRules::CheckCollect(*D, Data, Rng, U);
		HandleQuestUpdates(U);
	}
	return bOk;
}

bool FLBGame::UpgradeItem(const FString& Uid)
{
	const bool bOk = FLBRules::Upgrade(*D, Data, Uid);
	SfxUI(bOk ? TEXT("chest") : TEXT("uiError"));
	if (bOk)
	{
		Player->EquipWeapon();
		RefreshStats();
	}
	return bOk;
}

bool FLBGame::Save(const FString& Slot)
{
	Data.HpFrac = FMath::Clamp(Player->Hp / FMath::Max(1.f, Stats().MaxHp), 0.05f, 1.f);
	Data.Spirit = Player->Spirit;
	Data.bHasPos = !(bBossActive || Mode == ELBMode::Title);
	Data.PosX = Player->Pos.X;
	Data.PosZ = Player->Pos.Z;
	const bool bOk = LBSaves::Save(Slot, Data);
	if (!bOk) Toast(TEXT("Saving failed. Progress is kept for this session only."), TEXT("error"));
	return bOk;
}

void FLBGame::Autosave()
{
	if (Mode == ELBMode::Title || Mode == ELBMode::Error || !Area) return;
	Save(TEXT("auto"));
}

// =================================================================== Waypoints

FLBWaypoint FLBGame::Waypoint() const
{
	FLBWaypoint W;
	if (!Area || !Area->Data || Data.TrackedQuest.IsEmpty() || !D) return W;
	const FLBObjective* Obj = FLBRules::CurrentObjective(*D, Data, Data.TrackedQuest);
	if (!Obj) return W;
	const FString Here = Area->Data->Id;
	FString Target = Obj->Area;
	if (Obj->Target.StartsWith(TEXT("area:"))) Target = Obj->Target.Mid(5);
	if (!Target.IsEmpty() && Target != Here)
	{
		// Route through exits toward the objective's area.
		const FString Next = FLBRules::NextAreaToward(Here, Target);
		for (const FLBExitDef& Ex : Area->Data->Exits)
		{
			if (Ex.To != Next) continue;
			W.bValid = true;
			W.Pos = FVector(Ex.X, Area->GroundY(Ex.X, Ex.Z), Ex.Z);
			W.Label = Ex.Label;
			return W;
		}
		return W;
	}
	const FString& Wp = Obj->Waypoint;
	if (Wp.IsEmpty()) return W;
	for (const TUniquePtr<FLBNpc>& N : Npcs)
	{
		if (N->Id != Wp) continue;
		W.bValid = true;
		W.Pos = N->Pos;
		W.Label = N->Name;
		return W;
	}
	if (Wp == TEXT("brazier"))
	{
		float Bd = TNumericLimits<float>::Max();
		for (const FLBInteractObj& Io : Area->Interactables)
		{
			if (Io.Def.Kind != TEXT("brazier") || Data.LitBraziers.Contains(Io.Def.Id)) continue;
			const float Dd = FMath::Sqrt(FMath::Square(Io.Def.X - Player->Pos.X) + FMath::Square(Io.Def.Z - Player->Pos.Z));
			if (Dd < Bd)
			{
				Bd = Dd;
				W.bValid = true;
				W.Pos = FVector(Io.Def.X, Area->GroundY(Io.Def.X, Io.Def.Z), Io.Def.Z);
				W.Label = TEXT("Brazier");
			}
		}
		return W;
	}
	if (const FLBMarkerDef* M = Area->Data->FindMarker(Wp))
	{
		W.bValid = true;
		W.Pos = FVector(M->X, Area->GroundY(M->X, M->Z), M->Z);
		W.Label = Obj->Text;
	}
	return W;
}

// =================================================================== Presentation

void FLBGame::UpdatePresentation(float Dt)
{
	if (Camera)
	{
		const FVector CamPos = LB::ToWorld(Cam.Position.X, Cam.Position.Z, Cam.Position.Y);
		const FVector Focus = LB::ToWorld(Cam.Focus.X, Cam.Focus.Z, Cam.Focus.Y);
		Camera->SetActorLocationAndRotation(CamPos, (Focus - CamPos).Rotation());
		Camera->GetCameraComponent()->SetFieldOfView(Settings().Fov);
		Camera->GetCameraComponent()->PostProcessSettings.AutoExposureBias = Settings().Brightness;
		if (Area) Area->FollowView(CamPos);
	}
	const bool bSimRunning = Mode == ELBMode::Playing || Mode == ELBMode::Dialogue || Mode == ELBMode::Cutscene || Mode == ELBMode::Dead || Mode == ELBMode::Title;
	if (Fx && Player && Camera) Fx->Step(bSimRunning ? Dt : 0.f, Camera->GetActorRotation(), Player->Pos);
	if (Audio) Audio->Tick(Dt);

	for (int32 I = Toasts.Num() - 1; I >= 0; I--)
	{
		Toasts[I].T += Dt;
		if (Toasts[I].T > 4.7f) Toasts.RemoveAt(I);
	}
	for (int32 I = Captions.Num() - 1; I >= 0; I--)
	{
		Captions[I].T += Dt;
		if (Captions[I].T > Captions[I].Life + 0.45f) Captions.RemoveAt(I);
	}
	BannerT = FMath::Max(0.f, BannerT - Dt);
	HintT = FMath::Max(0.f, HintT - Dt);
	FadeT = FMath::Max(0.f, FadeT - Dt);
	DamageFlashT = FMath::Max(0.f, DamageFlashT - Dt);
	if (bDialogueOpen) DialogueShown = FMath::Min(float(DialogueText.Len()), DialogueShown + Dt * 55.f);
}

void FLBGame::ShowControlsHint()
{
	auto P = [this](ELBAction A) { return TEXT("[") + Prompt(A) + TEXT("]"); };
	const bool bPad = PC && PC->bGamepad;
	HintText = (bPad ? FString(TEXT("Left stick")) : P(ELBAction::MoveForward) + P(ELBAction::MoveLeft) + P(ELBAction::MoveBack) + P(ELBAction::MoveRight)) + TEXT(" Move   ") +
		(bPad ? TEXT("Right stick") : TEXT("Mouse")) + TEXT(" Camera   ") + P(ELBAction::Sprint) + TEXT(" Sprint\n") +
		P(ELBAction::Attack) + TEXT(" Attack   ") + P(ELBAction::Heavy) + TEXT(" Heavy   ") + P(ELBAction::Dodge) + TEXT(" Dodge   ") + P(ELBAction::Interact) + TEXT(" Talk   ") + P(ELBAction::Pause) + TEXT(" Menu");
	HintT = 9.f;
}

void FLBGame::ApplySettings()
{
	const FLBSettings& S = Settings();
	if (Audio) Audio->SetVolumes(S.MasterVolume, S.MusicVolume, S.SfxVolume);
	Cam.bShakeEnabled = S.bCameraShake;
	if (Fx)
	{
		Fx->bReduceFlashing = S.bReduceFlashing;
		Fx->bHighContrast = S.bHighContrastTelegraphs;
		Fx->bDamageNumbers = S.bDamageNumbers;
	}
	if (Mode != ELBMode::Error && Player) SyncCompanion();
}

void FLBGame::PersistSettings()
{
	if (GI) GI->PersistSettings();
	ApplySettings();
}
