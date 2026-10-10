// The game orchestrator (port of src/game/game.ts and the screen logic of
// src/ui/ui.ts). Owned by ALBGameMode; runs the fixed 60 Hz simulation, the
// camera, quests, dialogue, menus, saving and the ending. The HUD only draws
// what this class exposes.

#pragma once

#include "CoreMinimal.h"
#include "LBTypes.h"
#include "LBRules.h"
#include "LBSettings.h"
#include "LBEntities.h"
#include "LBPlayerController.h"
#include "LBScene.h"

class ALBGameMode;
class ALBArea;
class ALBFx;
class ALBVisual;
class ACameraActor;
class ULBData;
class ULBAudio;
class ULBGameInstance;
class UMaterialInterface;

enum class ELBMode : uint8 { Title, Playing, Paused, Dialogue, Menu, Dead, Cutscene, Credits, Error };

// ------------------------------------------------------------------ UI model

struct FLBMenuItem
{
	FString Label;
	FString Value;   // right-aligned text (setting value, price...)
	FString Detail;  // shown in the details panel while focused
	FLinearColor Color = FLinearColor(0.93f, 0.89f, 0.82f);
	bool bEnabled = true;
	bool bHeader = false; // non-selectable section title
	bool bSmall = false;
	TFunction<void()> OnConfirm;
	TFunction<void(int32)> OnAdjust; // left / right on settings
};

struct FLBScreen
{
	FString Name;
	TMap<FString, FString> Opts;
	int32 Focus = 0;
	int32 Tab = 0;
	int32 Scroll = 0;
	// Built content
	FString Title;
	FString Subtitle;
	TArray<FString> Tabs;
	TArray<FLBMenuItem> Items;
	FString InfoTitle;
	TArray<TPair<FString, FString>> InfoRows;
	FString Footer;
	TFunction<void()> OnYes; // confirm dialogs
	bool bTitleScreen = false;
};

struct FLBToast
{
	FString Text;
	FString Kind;
	float T = 0.f;
};

struct FLBCaption
{
	FString Speaker;
	FString Text;
	float T = 0.f;
	float Life = 3.f;
	bool bSound = false;
};

struct FLBWaypoint
{
	bool bValid = false;
	FVector Pos = FVector::ZeroVector; // game metres
	FString Label;
};

/** Third-person orbit camera with lock-on framing, collision and shake (port of camera.ts). */
struct FLBCameraRig
{
	float Yaw = 0.f;
	float Pitch = 0.32f;
	float Distance = 6.4f;
	FVector Focus = FVector::ZeroVector;
	FVector Position = FVector::ZeroVector;
	float ShakeAmt = 0.f;
	bool bShakeEnabled = true;
	bool bInit = false;
	FRandomStream Rng = FRandomStream(77);

	void SnapBehind(float InYaw)
	{
		Yaw = InYaw;
		Pitch = 0.32f;
		bInit = false;
	}
	void Shake(float Amount)
	{
		if (bShakeEnabled) ShakeAmt = FMath::Min(1.2f, ShakeAmt + Amount);
	}
	void Update(float Dt, float LookX, float LookY, const FVector& Player, const FVector* Lock, const ALBArea* Area, float ExtraDistance);
};

// ------------------------------------------------------------------ Game

class FLBGame
{
public:
	explicit FLBGame(ALBGameMode* InGM);
	~FLBGame();

	/** Called once the world is ready: loads data and shows the title screen. */
	void Begin();
	/** Real frame time; runs fixed simulation steps, the UI and presentation. */
	void Tick(float DeltaSeconds);

	// ----------------------------------------------------------- Shared state (entities use these)
	ALBGameMode* GM = nullptr;
	UWorld* World = nullptr;
	ULBData* D = nullptr;
	ULBGameInstance* GI = nullptr;
	ULBAudio* Audio = nullptr;
	ALBPlayerController* PC = nullptr;
	ALBArea* Area = nullptr;
	ALBFx* Fx = nullptr;
	ACameraActor* Camera = nullptr;
	UMaterialInterface* Mat = nullptr;

	FLBGameData Data;
	FRandomStream Rng;
	float Time = 0.f;
	ELBMode Mode = ELBMode::Title;
	FString FatalError;

	TUniquePtr<FLBPlayer> Player;
	TArray<TUniquePtr<FLBEnemy>> Enemies;
	TArray<TUniquePtr<FLBNpc>> Npcs;
	TUniquePtr<FLBCompanion> Companion;
	TUniquePtr<FLBProjectiles> Projectiles;
	TUniquePtr<FLBHazards> Hazards;
	TUniquePtr<FLBPickups> Pickups;
	FLBCameraRig Cam;

	FLBEnemy* Boss = nullptr;
	bool bBossActive = false;
	bool bInCombat = false;

	const FLBStats& Stats() const { return StatsCache; }
	const FLBSettings& Settings() const;
	void RefreshStats();

	// ----------------------------------------------------------- Entity context API
	int32 HitEnemy(FLBEnemy& E, const FLBHitInfo& Hit);
	bool HitPlayer(const FLBEnemyHit& Hit);
	void Hitstop(float Seconds) { HitstopT = FMath::Max(HitstopT, Seconds); }
	void Shake(float Amount) { Cam.Shake(Amount); }
	void Sfx(const FString& Name, float X, float Z, float Volume = 1.f);
	void SfxUI(const FString& Name, float Volume = 1.f);
	void Caption(const FString& Text, const FString& Speaker = FString(), float Seconds = 3.f);
	FLBEnemy* SpawnEnemy(const FString& Id, float X, float Z, int32 Level, bool bSummoned = false);
	void QuestEvent(const FString& Target);
	bool RequestToken(FLBEnemy& E);
	void ReleaseToken(FLBEnemy& E) { E.bHasToken = false; }
	float EnemyDamageMult() const;
	FLBEnemy* LockTarget() const { return Player ? Player->LockTarget : nullptr; }
	void OnWeaponSwapped() { RefreshStats(); }
	ALBVisual* SpawnVisual();
	FString Prompt(ELBAction A) const;
	/** Replaces {action} tokens (e.g. "{dodge}") with the current device's key names. */
	FString WithPrompts(const FString& Text) const;

	// ----------------------------------------------------------- Presentation state for the HUD
	TArray<FLBToast> Toasts;
	TArray<FLBCaption> Captions;
	FString BannerTitle, BannerSub;
	float BannerT = 0.f;
	FString HintText;
	float HintT = 0.f;
	float FadeT = 0.f;
	float DamageFlashT = 0.f;
	FLBEnemy* BossBar = nullptr;
	FString InteractionLabel;
	bool bShowHud = false;
	// Dialogue box
	bool bDialogueOpen = false;
	bool bDialogueCinematic = false;
	FString DialogueSpeaker;
	FString DialogueText;
	float DialogueShown = 0.f;
	TArray<FString> DialogueChoices;
	int32 ChoiceFocus = 0;
	bool DialogueTyping() const { return bDialogueOpen && DialogueShown < DialogueText.Len(); }
	// Screens
	TArray<FLBScreen> Screens;
	FLBScreen* TopScreen() { return Screens.Num() ? &Screens.Last() : nullptr; }
	/** Filled by the HUD while drawing: screen-space rectangles of the visible menu items. */
	TArray<TPair<int32, FBox2D>> ItemRects;
	TArray<TPair<int32, FBox2D>> TabRects;
	TArray<TPair<int32, FBox2D>> ChoiceRects;
	FLBWaypoint Waypoint() const;
	float Fps = 60.f;

	void Toast(const FString& Text, const FString& Kind = TEXT("info"));
	void Banner(const FString& Title, const FString& Sub = FString(), float Seconds = 3.5f);
	void DamageFlash();

	// ----------------------------------------------------------- Flow (used by menus)
	void NewGame();
	bool LoadSlot(const FString& Slot);
	bool Save(const FString& Slot);
	void Autosave();
	void QuitToTitle();
	void Respawn();
	void Rest();
	void FastTravel(const FString& To);
	void ContinueAfterEnding();
	void OpenPause();
	void OpenMenu(const FString& Name);
	void ResumePlay();
	void OpenScreen(const FString& Name, const TMap<FString, FString>& Opts = {});
	void Confirm(const FString& Title, const FString& Message, const FString& Yes, TFunction<void()> OnYes);
	void Back();
	void HideAllScreens();
	void RefreshScreen();
	void ApplySettings();
	void PersistSettings();

private:
	FLBStats StatsCache;
	float Acc = 0.f;
	float HitstopT = 0.f;
	float SlowmoT = 0.f;
	float LockedMsgT = 0.f;
	float InteractBufferT = 0.f;
	float DeathT = 0.f;
	bool bDeathShown = false;
	int32 EndingIndex = -1;
	float EndingT = 0.f;
	int32 SpawnCounter = 0;
	int32 EnemyUid = 0;
	float FpsAcc = 0.f;
	int32 FpsFrames = 0;
	TArray<TPair<FLBEnemySpawn, float>> RespawnQueue;
	struct FTimedCaption
	{
		float T;
		FString Text, Speaker;
		float Seconds;
	};
	TArray<FTimedCaption> CaptionQueue;
	float MusicResumeT = -1.f;
	bool bCapturingBinding = false;
	FString CaptureAction;
	bool bCapturePad = false;
	int32 CaptureSlot = 0;

	// Interaction
	enum class EInteract : uint8 { None, Npc, Object };
	EInteract InteractKind = EInteract::None;
	FLBNpc* InteractNpc = nullptr;
	int32 InteractObj = -1;
	// Dialogue
	FLBDialogueRunner Runner;
	FLBNpc* DialogueNpc = nullptr;
	FLBNpcDialogueEntry DialogueEntry;
	TArray<FString> Deferred;
	// Boss barrier
	FLBSpawnedPart BarrierVisual;
	bool bHasBarrier = false;

	void Step(float Dt);
	void StepPlaying(float Dt, const FLBInputFrame& F);
	void StepCutscene(float Dt, const FLBInputFrame& F);
	bool HandleGlobalInput(const FLBInputFrame& F);
	void CameraStep(float Dt, float LookX, float LookY);
	void UpdatePresentation(float Dt);
	void UpdateUi(float Dt);
	void HandleMenuInput();
	void HandleDialogueUiInput(const FLBInputFrame& F);

	bool AcquireLock();
	void CycleLock();
	TArray<TPair<FLBEnemy*, float>> LockCandidates(TArray<float>* OutAngles = nullptr);
	void SeparateEnemies();
	void UpdateRespawns(float Dt);
	void UpdateCombatMusic();
	void KillEnemy(FLBEnemy& E);
	void RemoveEnemyRefs(FLBEnemy* E);
	void GrantXp(int32 Xp);
	void Collect(const FLBPickupContent& C);
	void HandleQuestUpdates(const TArray<FLBQuestUpdate>& Updates);
	void AfterQuestStart(const FString& Id);

	void EnterArea(const FString& Id, const FString& SpawnId, bool bUseSavedPos = false);
	void ClearEntities();
	void SyncCompanion();
	void RefreshNpcMarkers();
	void CheckExits(float Dt);
	void Travel(const FString& To, const FString& Spawn);
	void CheckMarkers();
	void CheckBossTrigger();
	void RemoveBarrier();
	void OnBossDefeated(FLBEnemy& E);
	void OnPlayerDeath();
	void ShowTitleScene();

	void UpdateInteraction();
	void DoInteract();
	void UseObject(const FLBInteractDef& Def);

	void StartDialogue(FLBNpc& Npc);
	void ShowDialogueNode();
	void AdvanceDialogue();
	void ChooseDialogue(int32 Index);
	void RunDialogueActions();
	void EndDialogue();
	void RemoveNpc(FLBNpc* Npc, int32 Color);
	void ShowDialogue(const FString& Speaker, const FString& Text, const TArray<FString>& Choices, bool bCinematic);
	void HideDialogue();

	void StartEnding();

	// Services
	bool EquipItem(const FString& Uid, const FString& Slot);
	bool UnequipSlot(const FString& Slot);
	void AfterEquipChange();
	bool UseItem(const FString& Uid);
	TArray<const FLBShopEntry*> ShopStock() const;
	bool BuyItem(const FString& ItemId);
	bool UpgradeItem(const FString& Uid);

	// Screen builders (LBGameUI.cpp)
	void BuildScreen(FLBScreen& S);
	void BuildTitle(FLBScreen& S);
	void BuildPause(FLBScreen& S);
	void BuildInventory(FLBScreen& S);
	void BuildQuests(FLBScreen& S);
	void BuildSkills(FLBScreen& S, bool bTrain);
	void BuildShop(FLBScreen& S);
	void BuildSmith(FLBScreen& S);
	void BuildWayshrine(FLBScreen& S);
	void BuildSlots(FLBScreen& S, bool bSaving);
	void BuildSettings(FLBScreen& S);
	void BuildControls(FLBScreen& S);
	void BuildCredits(FLBScreen& S);
	void BuildDeath(FLBScreen& S);
	void BuildConfirm(FLBScreen& S);
	void BuildError(FLBScreen& S);
	FString ItemTitle(const FLBItemInstance& I) const;
	FString ItemDetails(const FLBItemInstance& I, const FString& CompareSlot) const;
	void ShowControlsHint();
	void PollBindingCapture();
};

namespace LBUi
{
	FLinearColor RarityColor(int32 Rarity);
	FString RarityName(int32 Rarity);
	FString FormatStat(const FString& Stat, float Value);
	FString FormatTime(float Seconds);
}
