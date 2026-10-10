// Menu screens and their actions (port of the screen logic in src/ui/ui.ts).
// Screens are lists of items rebuilt from game state; ALBHUD draws them and
// reports item rectangles back for mouse support.

#include "LBGame.h"
#include "LBGameInstance.h"
#include "LBArea.h"
#include "LBData.h"
#include "LBSave.h"
#include "LBPlayerController.h"
#include "Kismet/KismetSystemLibrary.h"

namespace LBUi
{
	FLinearColor RarityColor(int32 Rarity)
	{
		static const FColor Colors[] = {FColor(0xd9, 0xd4, 0xc7), FColor(0x7f, 0xd1, 0x7a), FColor(0x5f, 0xa8, 0xff), FColor(0xc2, 0x7b, 0xff), FColor(0xff, 0xc1, 0x45)};
		return FLinearColor(Colors[FMath::Clamp(Rarity, 0, 4)]);
	}

	FString RarityName(int32 Rarity)
	{
		static const TCHAR* Names[] = {TEXT("Common"), TEXT("Uncommon"), TEXT("Rare"), TEXT("Epic"), TEXT("Legendary")};
		return Names[FMath::Clamp(Rarity, 0, 4)];
	}

	FString FormatStat(const FString& Stat, float Value)
	{
		static const TMap<FString, FString> Labels = {
			{TEXT("atk"), TEXT("Attack")}, {TEXT("atkPct"), TEXT("Damage")}, {TEXT("def"), TEXT("Defense")}, {TEXT("maxHp"), TEXT("Max Health")},
			{TEXT("crit"), TEXT("Crit Chance")}, {TEXT("critDmg"), TEXT("Crit Damage")}, {TEXT("staminaRegen"), TEXT("Stamina Regen")},
			{TEXT("spiritGain"), TEXT("Spirit Gain")}, {TEXT("moveSpeed"), TEXT("Move Speed")}, {TEXT("lifesteal"), TEXT("Lifesteal")}, {TEXT("burnChance"), TEXT("Burn Chance")}};
		const FString* L = Labels.Find(Stat);
		const FString Label = L ? *L : Stat;
		const bool bPct = Stat != TEXT("atk") && Stat != TEXT("def") && Stat != TEXT("maxHp");
		if (bPct) return FString::Printf(TEXT("+%d%% %s"), FMath::RoundToInt(Value * 100.f), *Label);
		return FString::Printf(TEXT("+%d %s"), FMath::RoundToInt(Value), *Label);
	}

	FString FormatTime(float Seconds)
	{
		const int32 S = FMath::FloorToInt(Seconds);
		const int32 H = S / 3600;
		const int32 M = (S % 3600) / 60;
		return H > 0 ? FString::Printf(TEXT("%dh %dm"), H, M) : FString::Printf(TEXT("%dm %ds"), M, S % 60);
	}
}

namespace
{
	FLBMenuItem Button(const FString& Label, TFunction<void()> OnConfirm, bool bEnabled = true)
	{
		FLBMenuItem I;
		I.Label = Label;
		I.OnConfirm = MoveTemp(OnConfirm);
		I.bEnabled = bEnabled;
		return I;
	}

	FLBMenuItem Header(const FString& Label)
	{
		FLBMenuItem I;
		I.Label = Label;
		I.bHeader = true;
		I.Color = FLinearColor(1.f, 0.82f, 0.48f);
		return I;
	}

	FString Pips(int32 Rank, int32 Max)
	{
		FString S;
		for (int32 I = 0; I < Max; I++) S += I < Rank ? TEXT("#") : TEXT("-");
		return S;
	}
}

// =================================================================== Screen stack

void FLBGame::OpenScreen(const FString& Name, const TMap<FString, FString>& Opts)
{
	FLBScreen S;
	S.Name = Name;
	S.Opts = Opts;
	Screens.Add(MoveTemp(S));
	BuildScreen(Screens.Last());
	// Focus the first selectable item.
	FLBScreen& Top = Screens.Last();
	Top.Focus = 0;
	while (Top.Items.IsValidIndex(Top.Focus) && Top.Items[Top.Focus].bHeader) Top.Focus++;
	if (PC) PC->SetMenuMode(true);
	if (Name != TEXT("title") && Name != TEXT("death") && Name != TEXT("credits")) bShowHud = false;
}

void FLBGame::Confirm(const FString& Title, const FString& Message, const FString& Yes, TFunction<void()> OnYes)
{
	TMap<FString, FString> Opts;
	Opts.Add(TEXT("title"), Title);
	Opts.Add(TEXT("message"), Message);
	Opts.Add(TEXT("yes"), Yes);
	OpenScreen(TEXT("confirm"), Opts);
	Screens.Last().OnYes = MoveTemp(OnYes);
	BuildScreen(Screens.Last());
}

void FLBGame::Back()
{
	FLBScreen* Top = TopScreen();
	if (!Top) return;
	if (Top->Name == TEXT("title") || Top->Name == TEXT("death") || Top->Name == TEXT("error")) return;
	if (Top->Name == TEXT("credits") && Top->Opts.Contains(TEXT("ending"))) return;
	if (PC && PC->IsCapturing())
	{
		PC->CancelCapture();
		bCapturingBinding = false;
		RefreshScreen();
		return;
	}
	SfxUI(TEXT("uiBack"));
	Screens.Pop();
	if (Screens.Num() == 0)
	{
		if (Mode == ELBMode::Paused || Mode == ELBMode::Menu) ResumePlay();
	}
	else RefreshScreen();
}

void FLBGame::HideAllScreens()
{
	Screens.Reset();
	bDeathShown = false;
	bCapturingBinding = false;
	if (PC) PC->CancelCapture();
}

void FLBGame::RefreshScreen()
{
	FLBScreen* Top = TopScreen();
	if (!Top) return;
	BuildScreen(*Top);
	Top->Focus = FMath::Clamp(Top->Focus, 0, FMath::Max(0, Top->Items.Num() - 1));
	if (Top->Items.IsValidIndex(Top->Focus) && Top->Items[Top->Focus].bHeader)
	{
		while (Top->Items.IsValidIndex(Top->Focus) && Top->Items[Top->Focus].bHeader) Top->Focus++;
		if (!Top->Items.IsValidIndex(Top->Focus)) Top->Focus = 0;
	}
}

void FLBGame::BuildScreen(FLBScreen& S)
{
	S.Items.Reset();
	S.Tabs.Reset();
	S.InfoRows.Reset();
	S.InfoTitle.Empty();
	S.Title.Empty();
	S.Subtitle.Empty();
	S.Footer.Empty();
	S.bTitleScreen = false;
	const FString& N = S.Name;
	if (N == TEXT("title")) BuildTitle(S);
	else if (N == TEXT("pause")) BuildPause(S);
	else if (N == TEXT("inventory")) BuildInventory(S);
	else if (N == TEXT("quests")) BuildQuests(S);
	else if (N == TEXT("skills")) BuildSkills(S, false);
	else if (N == TEXT("shrine")) BuildSkills(S, true);
	else if (N == TEXT("shop")) BuildShop(S);
	else if (N == TEXT("smith")) BuildSmith(S);
	else if (N == TEXT("wayshrine")) BuildWayshrine(S);
	else if (N == TEXT("save")) BuildSlots(S, true);
	else if (N == TEXT("load")) BuildSlots(S, false);
	else if (N == TEXT("settings")) BuildSettings(S);
	else if (N == TEXT("controls")) BuildControls(S);
	else if (N == TEXT("credits")) BuildCredits(S);
	else if (N == TEXT("death")) BuildDeath(S);
	else if (N == TEXT("confirm")) BuildConfirm(S);
	else if (N == TEXT("error")) BuildError(S);
	else if (N == TEXT("item"))
	{
		// Actions for one inventory item.
		const FString Uid = S.Opts.FindRef(TEXT("uid"));
		const FLBItemInstance* Inst = FLBRules::FindItemConst(Data, Uid);
		const FLBItemDef* Def = Inst ? D->Item(Inst->Id) : nullptr;
		if (!Inst || !Def)
		{
			S.Title = TEXT("Item");
			S.Items.Add(Button(TEXT("Back"), [this]() { Back(); }));
			return;
		}
		S.Title = ItemTitle(*Inst);
		const FString Slot = Def->Kind == TEXT("weapon") ? (Data.ActiveWeapon == 1 ? TEXT("weapon2") : TEXT("weapon1")) : Def->Kind == TEXT("armor") ? TEXT("armor") : Def->Kind == TEXT("charm") ? TEXT("charm") : FString();
		S.InfoTitle = TEXT("Details");
		S.InfoRows.Add(TPair<FString, FString>(ItemDetails(*Inst, Slot), FString()));
		if (Def->Kind == TEXT("weapon"))
		{
			if (Data.Weapon1 != Uid) S.Items.Add(Button(TEXT("Equip as Weapon 1"), [this, Uid]() { EquipItem(Uid, TEXT("weapon1")); Back(); }));
			if (Data.Weapon2 != Uid) S.Items.Add(Button(TEXT("Equip as Weapon 2"), [this, Uid]() { EquipItem(Uid, TEXT("weapon2")); Back(); }));
			if (Data.Weapon2 == Uid) S.Items.Add(Button(TEXT("Unequip"), [this]() { if (!UnequipSlot(TEXT("weapon2"))) Toast(TEXT("You must keep at least one weapon equipped."), TEXT("error")); Back(); }));
		}
		else if (Def->Kind == TEXT("armor") || Def->Kind == TEXT("charm"))
		{
			const FString K = Def->Kind;
			const FString& Cur = K == TEXT("armor") ? Data.Armor : Data.Charm;
			if (Cur != Uid) S.Items.Add(Button(TEXT("Equip"), [this, Uid, K]() { EquipItem(Uid, K); Back(); }));
			else S.Items.Add(Button(TEXT("Unequip"), [this, K]() { UnequipSlot(K); Back(); }));
		}
		else if (Def->UseHeal > 0.f || Def->UseSpirit > 0.f || Def->UseBuffAtk > 0.f)
		{
			S.Items.Add(Button(TEXT("Use"), [this, Uid]() { UseItem(Uid); Back(); }));
		}
		S.Items.Add(Button(TEXT("Back"), [this]() { Back(); }));
	}
}

// =================================================================== Input

void FLBGame::UpdateUi(float Dt)
{
	if (!PC) return;
	const TArray<ELBNav> Navs = PC->TakeNav();
	if (bCapturingBinding)
	{
		PollBindingCapture();
		return;
	}
	FLBScreen* Top = TopScreen();

	// Dialogue choices (no screen open).
	if (!Top && bDialogueOpen && Mode == ELBMode::Dialogue)
	{
		const int32 N = DialogueChoices.Num();
		if (N > 0)
		{
			for (const ELBNav Nav : Navs)
			{
				if (Nav == ELBNav::Up || Nav == ELBNav::Down)
				{
					ChoiceFocus = (ChoiceFocus + (Nav == ELBNav::Down ? 1 : -1) + N) % N;
					SfxUI(TEXT("uiMove"));
				}
				else if (Nav == ELBNav::Confirm)
				{
					ChooseDialogue(ChoiceFocus);
					return;
				}
			}
			if (PC->NumberPressed >= 0 && PC->NumberPressed < N)
			{
				ChooseDialogue(PC->NumberPressed);
				return;
			}
			for (const TPair<int32, FBox2D>& R : ChoiceRects)
			{
				if (!R.Value.IsInside(PC->MousePos)) continue;
				if (PC->bMouseMoved) ChoiceFocus = R.Key;
				if (PC->bMouseClicked)
				{
					ChooseDialogue(R.Key);
					return;
				}
			}
			// The interact key (E / A) also picks the focused choice.
			if (PC->WasInputKeyJustPressed(EKeys::E))
			{
				ChooseDialogue(ChoiceFocus);
				return;
			}
		}
		else
		{
			bool bAdvance = PC->bMouseClicked;
			for (const ELBNav Nav : Navs) bAdvance |= Nav == ELBNav::Confirm;
			if (bAdvance)
			{
				AdvanceDialogue();
				// Enter/Space/click advanced the line; drop the same press for gameplay actions.
				PC->ClearAll();
			}
		}
		return;
	}
	if (!Top) return;

	auto MoveFocus = [this, Top](int32 Dir) {
		const int32 N = Top->Items.Num();
		if (N == 0) return;
		int32 F = Top->Focus;
		for (int32 Tries = 0; Tries < N; Tries++)
		{
			F = (F + Dir + N) % N;
			if (!Top->Items[F].bHeader) break;
		}
		if (F != Top->Focus)
		{
			Top->Focus = F;
			SfxUI(TEXT("uiMove"));
		}
	};
	auto SetTab = [this](int32 Tab) {
		FLBScreen* T = TopScreen();
		if (!T || T->Tabs.Num() == 0) return;
		T->Tab = (Tab + T->Tabs.Num()) % T->Tabs.Num();
		T->Focus = 0;
		T->Scroll = 0;
		SfxUI(TEXT("uiMove"));
		RefreshScreen();
	};
	auto ConfirmItem = [this](int32 Index) {
		FLBScreen* T = TopScreen();
		if (!T || !T->Items.IsValidIndex(Index)) return;
		FLBMenuItem& Item = T->Items[Index];
		if (Item.bHeader) return;
		if (!Item.bEnabled || !Item.OnConfirm)
		{
			SfxUI(TEXT("uiError"));
			return;
		}
		SfxUI(TEXT("uiConfirm"));
		// Copy: the action may rebuild or close this screen.
		const TFunction<void()> Action = Item.OnConfirm;
		Action();
	};

	for (const ELBNav Nav : Navs)
	{
		Top = TopScreen();
		if (!Top || bCapturingBinding) return;
		switch (Nav)
		{
		case ELBNav::Up: MoveFocus(-1); break;
		case ELBNav::Down: MoveFocus(1); break;
		case ELBNav::Left:
		case ELBNav::Right:
		{
			const int32 Dir = Nav == ELBNav::Left ? -1 : 1;
			if (Top->Items.IsValidIndex(Top->Focus) && Top->Items[Top->Focus].OnAdjust)
			{
				const TFunction<void(int32)> Adjust = Top->Items[Top->Focus].OnAdjust;
				Adjust(Dir);
				SfxUI(TEXT("uiMove"));
				RefreshScreen();
			}
			else if (Top->Tabs.Num() > 0) SetTab(Top->Tab + Dir);
			break;
		}
		case ELBNav::TabNext: SetTab(Top->Tab + 1); break;
		case ELBNav::TabPrev: SetTab(Top->Tab - 1); break;
		case ELBNav::Confirm: ConfirmItem(Top->Focus); break;
		case ELBNav::Back: Back(); break;
		}
	}

	// Mouse
	Top = TopScreen();
	if (!Top) return;
	for (const TPair<int32, FBox2D>& R : TabRects)
	{
		if (R.Value.IsInside(PC->MousePos) && PC->bMouseClicked)
		{
			SetTab(R.Key);
			return;
		}
	}
	for (const TPair<int32, FBox2D>& R : ItemRects)
	{
		if (!R.Value.IsInside(PC->MousePos)) continue;
		if (PC->bMouseMoved && Top->Items.IsValidIndex(R.Key) && !Top->Items[R.Key].bHeader) Top->Focus = R.Key;
		if (PC->bMouseClicked)
		{
			Top->Focus = R.Key;
			ConfirmItem(R.Key);
			return;
		}
	}
	if (PC->Wheel != 0.f) MoveFocus(PC->Wheel > 0.f ? -1 : 1);
}

void FLBGame::PollBindingCapture()
{
	if (!PC || PC->IsCapturing()) return;
	const FString Key = PC->CapturedKey;
	bCapturingBinding = false;
	if (Key.IsEmpty() || Key == TEXT("__cancel"))
	{
		RefreshScreen();
		return;
	}
	if (PC->bCapturedPad != bCapturePad)
	{
		Toast(bCapturePad ? TEXT("Press a gamepad button for this binding.") : TEXT("Press a keyboard key or mouse button for this binding."), TEXT("error"));
		RefreshScreen();
		return;
	}
	ELBAction Action = ELBAction::Count;
	for (int32 A = 0; A < LBActionCount; A++)
	{
		if (CaptureAction == LBInput::ActionId(ELBAction(A))) Action = ELBAction(A);
	}
	if (Action == ELBAction::Count || !GI) return;
	TArray<FLBBinding>& B = GI->Settings.Bindings;
	const TArray<ELBAction> Displaced = LBInput::Rebind(B, Action, Key, bCapturePad);
	if (CaptureSlot == 1 && !bCapturePad)
	{
		// Put the new key in the second slot.
		TArray<FString>& Own = B[int32(Action)].Keys;
		if (Own.Num() >= 2) Own.Swap(0, 1);
	}
	for (const ELBAction Dsp : Displaced) Toast(FString::Printf(TEXT("%s was unbound from %s."), *LBInput::KeyName(Key), *LBInput::ActionLabel(Dsp)), TEXT("info"));
	PersistSettings();
	RefreshScreen();
}

// =================================================================== Item helpers

FString FLBGame::ItemTitle(const FLBItemInstance& I) const
{
	const FLBItemDef* Def = D->Item(I.Id);
	FString S = Def && Def->IsEquipment() ? LBUi::RarityName(I.Rarity) + TEXT(" ") : FString();
	S += Def ? Def->Name : I.Id;
	if (I.Level > 0) S += FString::Printf(TEXT(" +%d"), I.Level);
	return S;
}

FString FLBGame::ItemDetails(const FLBItemInstance& I, const FString& CompareSlot) const
{
	const FLBItemDef* Def = D->Item(I.Id);
	if (!Def) return FString();
	FString S;
	if (Def->Kind == TEXT("weapon"))
	{
		const FLBWeaponFamily* Fam = D->Weapons.Find(Def->WeaponType);
		S += (Fam ? Fam->Name : Def->WeaponType) + FString::Printf(TEXT(" - Tier %d\n"), Def->Tier);
	}
	else S += Def->Kind.Left(1).ToUpper() + Def->Kind.Mid(1) + (Def->Tier ? FString::Printf(TEXT(" - Tier %d\n"), Def->Tier) : FString(TEXT("\n")));
	if (Def->IsEquipment())
	{
		TMap<FString, float> St;
		FLBRules::ItemStats(*D, I, St);
		TMap<FString, float> Cmp;
		if (!CompareSlot.IsEmpty())
		{
			const FString OtherUid = CompareSlot == TEXT("weapon1") ? Data.Weapon1 : CompareSlot == TEXT("weapon2") ? Data.Weapon2 : CompareSlot == TEXT("armor") ? Data.Armor : Data.Charm;
			const FLBItemInstance* Other = FLBRules::FindItemConst(Data, OtherUid);
			if (Other && Other->Uid != I.Uid) FLBRules::ItemStats(*D, *Other, Cmp);
		}
		for (const TPair<FString, float>& P : St)
		{
			S += LBUi::FormatStat(P.Key, P.Value);
			if (Cmp.Num() > 0)
			{
				const float Diff = P.Value - Cmp.FindRef(P.Key);
				if (FMath::Abs(Diff) > 0.0001f)
				{
					const bool bFlat = P.Key == TEXT("atk") || P.Key == TEXT("def") || P.Key == TEXT("maxHp");
					S += FString::Printf(TEXT("  (%s%d%s)"), Diff > 0.f ? TEXT("+") : TEXT("-"), bFlat ? FMath::Abs(FMath::RoundToInt(Diff)) : FMath::Abs(FMath::RoundToInt(Diff * 100.f)), bFlat ? TEXT("") : TEXT("%"));
				}
			}
			S += TEXT("\n");
		}
		if (Def->Kind == TEXT("weapon"))
		{
			if (const FLBWeaponFamily* Fam = D->Weapons.Find(Def->WeaponType))
			{
				S += Fam->Description + TEXT("\nAbility: ") + Fam->Ability.Name + TEXT(" - ") + Fam->Ability.Description + TEXT("\n");
			}
		}
	}
	else if (Def->Stackable) S += FString::Printf(TEXT("Owned: %d\n"), I.Qty);
	S += Def->Description + TEXT("\n");
	S += FString::Printf(TEXT("Sell value: %d coins"), FLBRules::SellValue(*D, I));
	return S;
}

// =================================================================== Screens

void FLBGame::BuildTitle(FLBScreen& S)
{
	S.bTitleScreen = true;
	S.Title = TEXT("LANTERNBOUND");
	S.Subtitle = TEXT("Embers of Hinoyama");
	const FString Latest = LBSaves::Latest();
	if (!Latest.IsEmpty())
	{
		S.Items.Add(Button(TEXT("Continue"), [this, Latest]() {
			HideAllScreens();
			if (!LoadSlot(Latest)) ShowTitleScene();
		}));
	}
	S.Items.Add(Button(TEXT("New Game"), [this, Latest]() {
		if (!Latest.IsEmpty()) Confirm(TEXT("Start a new game?"), TEXT("Your saves are kept; the new journey will autosave over the autosave slot."), TEXT("Begin"), [this]() { NewGame(); });
		else NewGame();
	}));
	S.Items.Add(Button(TEXT("Load Game"), [this]() { OpenScreen(TEXT("load")); }));
	S.Items.Add(Button(TEXT("Settings"), [this]() { OpenScreen(TEXT("settings")); }));
	S.Items.Add(Button(TEXT("Controls"), [this]() { OpenScreen(TEXT("controls")); }));
	S.Items.Add(Button(TEXT("Credits"), [this]() { OpenScreen(TEXT("credits")); }));
	S.Items.Add(Button(TEXT("Quit"), [this]() {
		if (PC) UKismetSystemLibrary::QuitGame(PC, PC, EQuitPreference::Quit, false);
	}));
	S.Footer = TEXT("An original action RPG - Unreal Engine port - progress saves to this computer");
}

void FLBGame::BuildPause(FLBScreen& S)
{
	S.Title = TEXT("Paused");
	S.Items.Add(Button(TEXT("Resume"), [this]() { Back(); }));
	S.Items.Add(Button(TEXT("Inventory & Equipment"), [this]() { OpenScreen(TEXT("inventory")); }));
	S.Items.Add(Button(TEXT("Quest Log"), [this]() { OpenScreen(TEXT("quests")); }));
	S.Items.Add(Button(TEXT("Skills"), [this]() { OpenScreen(TEXT("skills")); }));
	S.Items.Add(Button(bBossActive ? TEXT("Save Game (not during a boss fight)") : TEXT("Save Game"), [this]() { OpenScreen(TEXT("save")); }, !bBossActive));
	S.Items.Add(Button(TEXT("Load Game"), [this]() { OpenScreen(TEXT("load")); }));
	S.Items.Add(Button(TEXT("Settings"), [this]() { OpenScreen(TEXT("settings")); }));
	S.Items.Add(Button(TEXT("Controls"), [this]() { OpenScreen(TEXT("controls")); }));
	FLBMenuItem Quit = Button(TEXT("Quit to Title"), [this]() {
		Confirm(TEXT("Quit to the title screen?"), TEXT("Progress since your last save will be lost (the game autosaves often)."), TEXT("Quit"), [this]() { QuitToTitle(); });
	});
	Quit.Color = FLinearColor(1.f, 0.55f, 0.48f);
	S.Items.Add(Quit);
	S.Footer = FString::Printf(TEXT("Play time: %s    Defeated: %d    Difficulty: %s"), *LBUi::FormatTime(Data.PlayTime), Data.Kills, *LBSettingsUtil::DifficultyName(Settings().Difficulty));
}

void FLBGame::BuildInventory(FLBScreen& S)
{
	S.Title = TEXT("Inventory");
	S.Tabs = {TEXT("Equipment"), TEXT("Items")};
	const bool bEquipTab = S.Tab == 0;
	// Equipped slots
	S.Items.Add(Header(TEXT("Equipped")));
	const TPair<FString, FString> Slots[] = {{TEXT("Weapon 1"), Data.Weapon1}, {TEXT("Weapon 2"), Data.Weapon2}, {TEXT("Armor"), Data.Armor}, {TEXT("Charm"), Data.Charm}};
	int32 SlotIndex = 0;
	for (const TPair<FString, FString>& Sl : Slots)
	{
		const FLBItemInstance* Inst = FLBRules::FindItemConst(Data, Sl.Value);
		FLBMenuItem I;
		const bool bActive = (SlotIndex == 0 && Data.ActiveWeapon == 0) || (SlotIndex == 1 && Data.ActiveWeapon == 1);
		I.Label = Sl.Key + (bActive ? TEXT(" *") : TEXT("")) + TEXT(": ") + (Inst ? ItemTitle(*Inst) : FString(TEXT("-")));
		if (Inst)
		{
			I.Color = LBUi::RarityColor(Inst->Rarity);
			I.Detail = ItemDetails(*Inst, FString());
			const FString Uid = Inst->Uid;
			I.OnConfirm = [this, Uid]() {
				TMap<FString, FString> O;
				O.Add(TEXT("uid"), Uid);
				OpenScreen(TEXT("item"), O);
			};
		}
		else I.bEnabled = false;
		I.bSmall = true;
		S.Items.Add(I);
		SlotIndex++;
	}
	// Bag
	TArray<const FLBItemInstance*> Items;
	for (const FLBItemInstance& Inst : Data.Inventory)
	{
		const FLBItemDef* Def = D->Item(Inst.Id);
		if (Def && Def->IsEquipment() == bEquipTab) Items.Add(&Inst);
	}
	Items.Sort([this](const FLBItemInstance& A, const FLBItemInstance& B) {
		const bool Ea = FLBRules::IsEquipped(Data, A.Uid), Eb = FLBRules::IsEquipped(Data, B.Uid);
		if (Ea != Eb) return Ea;
		if (A.Rarity != B.Rarity) return A.Rarity > B.Rarity;
		const FLBItemDef* Da = D->Item(A.Id);
		const FLBItemDef* Db = D->Item(B.Id);
		return (Da ? Da->Tier : 0) > (Db ? Db->Tier : 0);
	});
	int32 EquipCount = 0;
	for (const FLBItemInstance& Inst : Data.Inventory)
	{
		const FLBItemDef* Def = D->Item(Inst.Id);
		EquipCount += Def && Def->IsEquipment() ? 1 : 0;
	}
	S.Items.Add(Header(bEquipTab ? FString::Printf(TEXT("Equipment (%d / %d)"), EquipCount, FLBRules::MaxEquipment) : FString(TEXT("Items"))));
	for (const FLBItemInstance* Inst : Items)
	{
		const FLBItemDef* Def = D->Item(Inst->Id);
		FLBMenuItem I;
		I.Label = ItemTitle(*Inst);
		if (Def && Def->Stackable) I.Value = FString::Printf(TEXT("x%d"), Inst->Qty);
		if (FLBRules::IsEquipped(Data, Inst->Uid)) I.Value = TEXT("equipped");
		I.Color = LBUi::RarityColor(Inst->Rarity);
		const FString Slot = Def && Def->Kind == TEXT("weapon") ? (Data.ActiveWeapon == 1 ? TEXT("weapon2") : TEXT("weapon1")) : Def && Def->Kind == TEXT("armor") ? TEXT("armor") : Def && Def->Kind == TEXT("charm") ? TEXT("charm") : FString();
		I.Detail = ItemDetails(*Inst, Slot);
		const FString Uid = Inst->Uid;
		I.OnConfirm = [this, Uid]() {
			TMap<FString, FString> O;
			O.Add(TEXT("uid"), Uid);
			OpenScreen(TEXT("item"), O);
		};
		S.Items.Add(I);
	}
	if (Items.Num() == 0) S.Items.Add(Header(TEXT("(empty)")));
	S.Items.Add(Button(TEXT("Close"), [this]() { Back(); }));
	// Character sheet
	const FLBStats& St = Stats();
	S.InfoTitle = TEXT("Character");
	auto Row = [&S](const FString& A, const FString& B) { S.InfoRows.Add(TPair<FString, FString>(A, B)); };
	Row(TEXT("Level"), FString::FromInt(Data.Level));
	Row(TEXT("Health"), FString::Printf(TEXT("%d / %d"), FMath::CeilToInt(Player->Hp), FMath::RoundToInt(St.MaxHp)));
	Row(TEXT("Attack"), FString::FromInt(FMath::RoundToInt(St.Atk)));
	Row(TEXT("Damage bonus"), FString::Printf(TEXT("%d%%"), FMath::RoundToInt(St.AtkPct * 100.f)));
	Row(TEXT("Defense"), FString::FromInt(FMath::RoundToInt(St.Def)));
	Row(TEXT("Crit chance"), FString::Printf(TEXT("%d%%"), FMath::RoundToInt(St.Crit * 100.f)));
	Row(TEXT("Crit damage"), FString::Printf(TEXT("+%d%%"), FMath::RoundToInt(St.CritDmg * 100.f)));
	Row(TEXT("Stamina regen"), FString::Printf(TEXT("+%d%%"), FMath::RoundToInt(St.StaminaRegen * 100.f)));
	Row(TEXT("Spirit gain"), FString::Printf(TEXT("+%d%%"), FMath::RoundToInt(St.SpiritGain * 100.f)));
	Row(TEXT("Move speed"), FString::Printf(TEXT("+%d%%"), FMath::RoundToInt(St.MoveSpeed * 100.f)));
	Row(TEXT("Lifesteal"), FString::Printf(TEXT("%d%%"), FMath::RoundToInt(St.Lifesteal * 100.f)));
	Row(TEXT("Coins"), FString::FromInt(Data.Coins));
	S.Footer = FString::Printf(TEXT("Select an item for actions.   Left/Right or LB/RB: switch tabs.   %s: swap weapons in combat"), *Prompt(ELBAction::SwapWeapon));
}

void FLBGame::BuildQuests(FLBScreen& S)
{
	S.Title = TEXT("Quest Log");
	S.Items.Add(Header(TEXT("Active")));
	TArray<FLBQuestState> Active = Data.ActiveQuests;
	Active.Sort([this](const FLBQuestState& A, const FLBQuestState& B) {
		const FLBQuestDef* Qa = D->Quests.Find(A.Id);
		const FLBQuestDef* Qb = D->Quests.Find(B.Id);
		const bool Ma = Qa && Qa->Kind == TEXT("main"), Mb = Qb && Qb->Kind == TEXT("main");
		return Ma && !Mb;
	});
	for (const FLBQuestState& St : Active)
	{
		const FLBQuestDef* Q = D->Quests.Find(St.Id);
		if (!Q) continue;
		FLBMenuItem I;
		I.Label = (Q->Kind == TEXT("main") ? TEXT("* ") : TEXT("")) + Q->Title;
		I.Value = Data.TrackedQuest == St.Id ? TEXT("tracked") : TEXT("track");
		if (Q->Kind == TEXT("main")) I.Color = FLinearColor(1.f, 0.82f, 0.48f);
		FString Detail = Q->Summary + TEXT("\n\n");
		for (int32 O = 0; O <= St.Stage && O < Q->Objectives.Num(); O++)
		{
			if (O < St.Stage) Detail += TEXT("[done] ") + Q->Objectives[O].Text + TEXT("\n");
			else Detail += TEXT("> ") + FLBRules::ObjectiveText(*D, Data, St.Id) + TEXT("\n");
		}
		const FLBObjective* Cur = FLBRules::CurrentObjective(*D, Data, St.Id);
		if (Cur && !Cur->Hint.IsEmpty()) Detail += TEXT("\nHint: ") + WithPrompts(Cur->Hint);
		I.Detail = Detail;
		const FString Id = St.Id;
		I.OnConfirm = [this, Id]() {
			Data.TrackedQuest = Id;
			RefreshScreen();
		};
		S.Items.Add(I);
	}
	if (Active.Num() == 0) S.Items.Add(Header(TEXT("No active quests. Speak with the villagers of Akari.")));
	S.Items.Add(Header(FString::Printf(TEXT("Completed (%d)"), Data.CompletedQuests.Num())));
	for (const FString& Id : Data.CompletedQuests)
	{
		const FLBQuestDef* Q = D->Quests.Find(Id);
		if (!Q) continue;
		FLBMenuItem I;
		I.Label = Q->Title;
		I.Color = FLinearColor(0.6f, 0.58f, 0.62f);
		I.Detail = Q->Summary;
		I.bEnabled = false;
		I.bSmall = true;
		S.Items.Add(I);
	}
	S.Items.Add(Button(TEXT("Close"), [this]() { Back(); }));
}

void FLBGame::BuildSkills(FLBScreen& S, bool bTrain)
{
	S.Title = bTrain ? TEXT("Mikoto's Shrine - Training") : TEXT("Skills");
	S.Subtitle = FString::Printf(TEXT("Skill points: %d%s"), Data.SkillPoints, bTrain ? TEXT("") : TEXT("  - spend them with Mikoto at the village shrine."));
	for (const FLBSkillDef& Sk : D->Skills)
	{
		const int32* RankPtr = Data.Skills.Find(Sk.Id);
		const int32 Rank = RankPtr ? *RankPtr : 0;
		FString Reason;
		if (Rank >= Sk.MaxRank) Reason = TEXT("Mastered");
		else if (Sk.RequiresLevel > 0 && Data.Level < Sk.RequiresLevel) Reason = FString::Printf(TEXT("Requires level %d"), Sk.RequiresLevel);
		else if (Data.SkillPoints <= 0) Reason = TEXT("No skill points");
		FLBMenuItem I;
		I.Label = Sk.Name + TEXT("  ") + Pips(Rank, Sk.MaxRank);
		I.Value = bTrain ? (Reason.IsEmpty() ? FString(TEXT("Train")) : Reason) : FString::Printf(TEXT("%d/%d"), Rank, Sk.MaxRank);
		I.Detail = Sk.Description;
		I.bEnabled = bTrain && Reason.IsEmpty();
		const FString Id = Sk.Id;
		const FString Name = Sk.Name;
		if (bTrain)
		{
			I.OnConfirm = [this, Id, Name]() {
				const FString R = FLBRules::TrainSkill(*D, Data, Id);
				SfxUI(R.IsEmpty() ? TEXT("levelUp") : TEXT("uiError"));
				RefreshStats();
				if (R.IsEmpty()) Toast(TEXT("Trained ") + Name + TEXT("."), TEXT("quest"));
				RefreshScreen();
			};
		}
		S.Items.Add(I);
	}
	if (bTrain)
	{
		S.Items.Add(Button(TEXT("Reset skills (100 coins)"), [this]() {
			Confirm(TEXT("Reset skills?"), TEXT("All skill points will be refunded for 100 coins."), TEXT("Reset"), [this]() {
				if (Data.Coins < 100) Toast(TEXT("Not enough coins."), TEXT("error"));
				else
				{
					Data.Coins -= 100;
					FLBRules::ResetSkills(Data);
					RefreshStats();
				}
			});
		}));
	}
	S.Items.Add(Button(TEXT("Close"), [this]() { Back(); }));
}

void FLBGame::BuildShop(FLBScreen& S)
{
	S.Title = TEXT("The Fallen Leaf - Ohana's Wares");
	S.Subtitle = FString::Printf(TEXT("Your coins: %d"), Data.Coins);
	S.Tabs = {TEXT("Buy"), TEXT("Sell")};
	if (S.Tab == 0)
	{
		for (const FLBShopEntry* E : ShopStock())
		{
			const FLBItemDef* Def = D->Item(E->Item);
			if (!Def) continue;
			FLBMenuItem I;
			I.Label = (E->Rarity >= 0 && Def->IsEquipment() ? LBUi::RarityName(E->Rarity) + TEXT(" ") : FString()) + Def->Name;
			if (Def->Stackable) I.Label += FString::Printf(TEXT("  (owned %d/%d)"), FLBRules::CountItem(Data, E->Item), Def->MaxStack);
			I.Value = FString::Printf(TEXT("%d coins"), E->Price);
			I.Detail = Def->Description;
			if (E->Rarity >= 0) I.Color = LBUi::RarityColor(E->Rarity);
			I.bEnabled = Data.Coins >= E->Price;
			const FString Id = E->Item;
			const FString Name = Def->Name;
			I.OnConfirm = [this, Id, Name]() {
				if (BuyItem(Id)) Toast(TEXT("Bought ") + Name + TEXT("."), TEXT("item"));
				else Toast(TEXT("Cannot buy that (not enough coins, or you carry the maximum)."), TEXT("error"));
				RefreshScreen();
			};
			S.Items.Add(I);
		}
	}
	else
	{
		for (const FLBItemInstance& Inst : Data.Inventory)
		{
			const FLBItemDef* Def = D->Item(Inst.Id);
			if (!Def || Def->Kind == TEXT("key") || FLBRules::IsEquipped(Data, Inst.Uid)) continue;
			FLBMenuItem I;
			I.Label = ItemTitle(Inst) + (Def->Stackable ? FString::Printf(TEXT(" x%d"), Inst.Qty) : FString());
			I.Value = FString::Printf(TEXT("sell %d"), FLBRules::SellValue(*D, Inst));
			I.Color = LBUi::RarityColor(Inst.Rarity);
			I.Detail = ItemDetails(Inst, FString());
			const FString Uid = Inst.Uid;
			const FString Title = ItemTitle(Inst);
			const int32 Value = FLBRules::SellValue(*D, Inst);
			I.OnConfirm = [this, Uid, Title, Value]() {
				Confirm(TEXT("Sell ") + Title + TEXT("?"), FString::Printf(TEXT("You will receive %d coins."), Value), TEXT("Sell"), [this, Uid]() {
					const int32 Coins = FLBRules::Sell(*D, Data, Uid);
					if (Coins > 0)
					{
						SfxUI(TEXT("coin"));
						Toast(FString::Printf(TEXT("Sold for %d coins."), Coins), TEXT("item"));
					}
				});
			};
			S.Items.Add(I);
		}
		if (S.Items.Num() == 0) S.Items.Add(Header(TEXT("Nothing to sell.")));
	}
	S.Items.Add(Button(TEXT("Leave"), [this]() { Back(); }));
}

void FLBGame::BuildSmith(FLBScreen& S)
{
	S.Title = TEXT("Kanetsugu's Forge");
	S.Subtitle = FString::Printf(TEXT("Coins %d - Spirit Ore %d - Hollow Essence %d.  Each upgrade raises an item's base stats by 12%% (max +%d)."), Data.Coins, FLBRules::CountItem(Data, TEXT("spirit_ore")), FLBRules::CountItem(Data, TEXT("hollow_essence")), FLBRules::MaxUpgrade);
	TArray<const FLBItemInstance*> Gear;
	for (const FLBItemInstance& Inst : Data.Inventory)
	{
		const FLBItemDef* Def = D->Item(Inst.Id);
		if (Def && Def->IsEquipment()) Gear.Add(&Inst);
	}
	Gear.Sort([this](const FLBItemInstance& A, const FLBItemInstance& B) {
		const bool Ea = FLBRules::IsEquipped(Data, A.Uid), Eb = FLBRules::IsEquipped(Data, B.Uid);
		if (Ea != Eb) return Ea;
		const FLBItemDef* Da = D->Item(A.Id);
		const FLBItemDef* Db = D->Item(B.Id);
		return (Da ? Da->Tier : 0) > (Db ? Db->Tier : 0);
	});
	for (const FLBItemInstance* Inst : Gear)
	{
		int32 Coins = 0, Ore = 0, Essence = 0;
		const bool bHasCost = FLBRules::UpgradeCost(*D, *Inst, Coins, Ore, Essence);
		const bool bCan = bHasCost && Data.Coins >= Coins && FLBRules::CountItem(Data, TEXT("spirit_ore")) >= Ore && FLBRules::CountItem(Data, TEXT("hollow_essence")) >= Essence;
		FLBMenuItem I;
		I.Label = ItemTitle(*Inst) + (FLBRules::IsEquipped(Data, Inst->Uid) ? TEXT(" (equipped)") : TEXT(""));
		I.Value = bHasCost ? FString::Printf(TEXT("+%d: %d coins, %d ore%s"), Inst->Level + 1, Coins, Ore, Essence ? *FString::Printf(TEXT(", %d essence"), Essence) : TEXT("")) : FString(TEXT("Mastered"));
		I.Color = LBUi::RarityColor(Inst->Rarity);
		I.Detail = ItemDetails(*Inst, FString());
		I.bEnabled = bCan;
		const FString Uid = Inst->Uid;
		I.OnConfirm = [this, Uid]() {
			if (UpgradeItem(Uid))
			{
				if (const FLBItemInstance* After = FLBRules::FindItemConst(Data, Uid)) Toast(FString::Printf(TEXT("%s upgraded to +%d!"), *ItemTitle(*After).LeftChop(3), After->Level), TEXT("quest"));
			}
			RefreshScreen();
		};
		S.Items.Add(I);
	}
	S.Items.Add(Button(TEXT("Leave"), [this]() { Back(); }));
}

void FLBGame::BuildWayshrine(FLBScreen& S)
{
	S.Title = TEXT("Wayshrine");
	S.Subtitle = TEXT("A small shrine of red lacquer. Its lantern still burns.");
	S.Items.Add(Button(TEXT("Rest (restore health, save, enemies return)"), [this]() {
		HideAllScreens();
		ResumePlay();
		Rest();
	}));
	S.Items.Add(Button(TEXT("Save Game"), [this]() { OpenScreen(TEXT("save")); }));
	TArray<FString> Visited;
	for (const FString& A : Data.VisitedAreas)
	{
		if (Area && Area->Data && A != Area->Data->Id) Visited.Add(A);
	}
	if (Visited.Num() > 0) S.Items.Add(Header(TEXT("Travel")));
	for (const FString& A : Visited)
	{
		S.Items.Add(Button(TEXT("Travel to ") + FLBRules::AreaName(A), [this, A]() {
			HideAllScreens();
			ResumePlay();
			FastTravel(A);
		}));
	}
	S.Items.Add(Button(TEXT("Leave"), [this]() { Back(); }));
}

void FLBGame::BuildSlots(FLBScreen& S, bool bSaving)
{
	S.Title = bSaving ? TEXT("Save Game") : TEXT("Load Game");
	for (const FString& Slot : LBSaves::Slots())
	{
		if (bSaving && Slot == TEXT("auto")) continue;
		const FLBSlotSummary Sum = LBSaves::Summary(Slot);
		const FString Name = Slot == TEXT("auto") ? FString(TEXT("Autosave")) : TEXT("Slot ") + Slot;
		FString Desc = TEXT("Empty");
		if (Sum.bCorrupt) Desc = TEXT("Damaged - cannot be loaded");
		else if (Sum.bExists) Desc = FString::Printf(TEXT("Lv %d - %s - %s - %s - %s"), Sum.Level, *Sum.Area, *Sum.Quest, *LBUi::FormatTime(Sum.PlayTime), *FDateTime::FromUnixTimestamp(Sum.SavedAt).ToString(TEXT("%Y-%m-%d %H:%M")));
		FLBMenuItem I;
		I.Label = Name;
		I.Value = Desc;
		if (bSaving)
		{
			I.OnConfirm = [this, Slot, Sum]() {
				auto DoSave = [this, Slot]() {
					if (Save(Slot))
					{
						Toast(FString::Printf(TEXT("Saved to slot %s."), *Slot), TEXT("info"));
						SfxUI(TEXT("questUpdate"));
					}
					RefreshScreen();
				};
				if (Sum.bExists) Confirm(FString::Printf(TEXT("Overwrite slot %s?"), *Slot), TEXT("The existing save in this slot will be replaced."), TEXT("Overwrite"), DoSave);
				else DoSave();
			};
		}
		else
		{
			I.bEnabled = Sum.bExists && !Sum.bCorrupt;
			I.OnConfirm = [this, Slot]() {
				auto DoLoad = [this, Slot]() {
					HideAllScreens();
					if (!LoadSlot(Slot)) ShowTitleScene();
				};
				if (Mode == ELBMode::Title || Mode == ELBMode::Dead) DoLoad();
				else Confirm(TEXT("Load this save?"), TEXT("Unsaved progress since your last save will be lost."), TEXT("Load"), DoLoad);
			};
		}
		S.Items.Add(I);
		if (Sum.bExists)
		{
			FLBMenuItem Del = Button(TEXT("   Delete ") + Name, [this, Slot, Name]() {
				Confirm(TEXT("Delete ") + Name + TEXT("?"), TEXT("This cannot be undone."), TEXT("Delete"), [this, Slot]() {
					LBSaves::Delete(Slot);
					Toast(TEXT("Save deleted."), TEXT("info"));
				});
			});
			Del.bSmall = true;
			Del.Color = FLinearColor(1.f, 0.55f, 0.48f);
			S.Items.Add(Del);
		}
	}
	S.Items.Add(Button(TEXT("Back"), [this]() { Back(); }));
	S.Footer = TEXT("Saves are stored in the project's Saved/SaveGames folder (each slot keeps a backup copy).");
}

void FLBGame::BuildSettings(FLBScreen& S)
{
	S.Title = TEXT("Settings");
	S.Tabs = {TEXT("Gameplay"), TEXT("Controls"), TEXT("Audio"), TEXT("Accessibility"), TEXT("Graphics")};
	FLBSettings& St = GI ? GI->Settings : const_cast<FLBSettings&>(Settings());
	auto Changed = [this]() { PersistSettings(); };
	auto Toggle = [&](const FString& Label, bool& Value) {
		FLBMenuItem I;
		I.Label = Label;
		I.Value = Value ? TEXT("On") : TEXT("Off");
		bool* Ptr = &Value;
		I.OnConfirm = [this, Ptr, Changed]() {
			*Ptr = !*Ptr;
			Changed();
			RefreshScreen();
		};
		I.OnAdjust = [Ptr, Changed](int32) {
			*Ptr = !*Ptr;
			Changed();
		};
		S.Items.Add(I);
	};
	auto Cycle = [&](const FString& Label, int32& Value, const TArray<FString>& Names) {
		FLBMenuItem I;
		I.Label = Label;
		I.Value = TEXT("< ") + Names[FMath::Clamp(Value, 0, Names.Num() - 1)] + TEXT(" >");
		int32* Ptr = &Value;
		const int32 Count = Names.Num();
		I.OnAdjust = [Ptr, Count, Changed](int32 Dir) {
			*Ptr = (*Ptr + Dir + Count) % Count;
			Changed();
		};
		I.OnConfirm = [this, Ptr, Count, Changed]() {
			*Ptr = (*Ptr + 1) % Count;
			Changed();
			RefreshScreen();
		};
		S.Items.Add(I);
	};
	auto Slider = [&](const FString& Label, float& Value, float Min, float Max, float Step, bool bPct, const TCHAR* Suffix = TEXT("")) {
		FLBMenuItem I;
		I.Label = Label;
		I.Value = bPct ? FString::Printf(TEXT("< %d%% >"), FMath::RoundToInt(Value * 100.f)) : FString::Printf(TEXT("< %.2f%s >"), Value, Suffix);
		float* Ptr = &Value;
		I.OnAdjust = [Ptr, Min, Max, Step, Changed](int32 Dir) {
			*Ptr = FMath::Clamp(FMath::RoundToFloat((*Ptr + Dir * Step) / Step) * Step, Min, Max);
			Changed();
		};
		S.Items.Add(I);
	};

	switch (S.Tab)
	{
	case 0:
		Cycle(TEXT("Difficulty"), St.Difficulty, {TEXT("Story (gentle)"), TEXT("Normal"), TEXT("Hard")});
		{
			int32 Hold = St.bLockOnHold ? 1 : 0;
			FLBMenuItem I;
			I.Label = TEXT("Lock-on mode");
			I.Value = St.bLockOnHold ? TEXT("< Hold >") : TEXT("< Toggle >");
			bool* Ptr = &St.bLockOnHold;
			I.OnAdjust = [Ptr, Changed](int32) {
				*Ptr = !*Ptr;
				Changed();
			};
			I.OnConfirm = [this, Ptr, Changed]() {
				*Ptr = !*Ptr;
				Changed();
				RefreshScreen();
			};
			S.Items.Add(I);
			(void)Hold;
		}
		Toggle(TEXT("Auto-face nearby enemies when attacking"), St.bAutoFaceTarget);
		Toggle(TEXT("Fox companion (Kohaku) follows you"), St.bCompanionEnabled);
		Toggle(TEXT("Show damage numbers"), St.bDamageNumbers);
		S.Footer = TEXT("Difficulty applies immediately to damage taken; enemy health changes on the next area load.");
		break;
	case 1:
		Slider(TEXT("Mouse / key camera sensitivity"), St.MouseSensitivity, 0.1f, 3.f, 0.05f, false);
		Slider(TEXT("Gamepad camera sensitivity"), St.StickSensitivity, 0.1f, 3.f, 0.05f, false);
		Toggle(TEXT("Invert camera Y"), St.bInvertY);
		S.Items.Add(Header(TEXT("Key bindings - select a binding, then press the new key or button (Esc cancels)")));
		for (int32 A = 0; A < LBActionCount; A++)
		{
			const ELBAction Act = ELBAction(A);
			const FLBBinding& B = St.Bindings.IsValidIndex(A) ? St.Bindings[A] : FLBBinding();
			const bool bStick = A <= int32(ELBAction::LookDown);
			for (int32 Slot = 0; Slot < (bStick ? 2 : 3); Slot++)
			{
				const bool bPad = Slot == 2;
				FLBMenuItem I;
				I.bSmall = true;
				I.Label = LBInput::ActionLabel(Act) + (bPad ? TEXT("  (gamepad)") : Slot == 0 ? TEXT("") : TEXT("  (alternate)"));
				const TArray<FString>& List = bPad ? B.Pad : B.Keys;
				const int32 Idx = bPad ? 0 : Slot;
				const bool bThisCapturing = bCapturingBinding && CaptureAction == LBInput::ActionId(Act) && CaptureSlot == Slot;
				I.Value = bThisCapturing ? FString(TEXT("Press...")) : (List.IsValidIndex(Idx) ? LBInput::KeyName(List[Idx]) : FString(TEXT("-")));
				const FString Id = LBInput::ActionId(Act);
				I.OnConfirm = [this, Id, Slot, bPad]() {
					bCapturingBinding = true;
					CaptureAction = Id;
					CaptureSlot = Slot;
					bCapturePad = bPad;
					if (PC) PC->BeginCapture();
					RefreshScreen();
				};
				S.Items.Add(I);
			}
		}
		S.Items.Add(Button(TEXT("Reset bindings to defaults"), [this]() {
			if (GI) GI->Settings.Bindings = LBInput::DefaultBindings();
			PersistSettings();
			Toast(TEXT("Bindings reset."), TEXT("info"));
			RefreshScreen();
		}));
		S.Footer = TEXT("Movement on a gamepad always uses the left stick; the camera uses the right stick.");
		break;
	case 2:
		Slider(TEXT("Master volume"), St.MasterVolume, 0.f, 1.f, 0.05f, true);
		Slider(TEXT("Music volume"), St.MusicVolume, 0.f, 1.f, 0.05f, true);
		Slider(TEXT("Effects volume"), St.SfxVolume, 0.f, 1.f, 0.05f, true);
		break;
	case 3:
		Toggle(TEXT("Subtitles for spoken lines"), St.bSubtitles);
		Cycle(TEXT("Subtitle & dialogue text size"), St.SubtitleSize, {TEXT("Small"), TEXT("Medium"), TEXT("Large"), TEXT("Extra large")});
		Slider(TEXT("Subtitle background opacity"), St.SubtitleBackground, 0.f, 1.f, 0.05f, true);
		Toggle(TEXT("Captions for important sounds"), St.bSoundCaptions);
		Toggle(TEXT("Camera shake"), St.bCameraShake);
		Toggle(TEXT("Reduce flashing effects"), St.bReduceFlashing);
		Toggle(TEXT("High-contrast attack warnings (yellow/magenta)"), St.bHighContrastTelegraphs);
		Slider(TEXT("Field of view"), St.Fov, 55.f, 100.f, 1.f, false, TEXT(" deg"));
		S.Footer = TEXT("All controls are remappable under Controls. Story difficulty halves incoming damage.");
		break;
	default:
		Cycle(TEXT("Graphics quality"), St.Quality, {TEXT("Low"), TEXT("Medium"), TEXT("High"), TEXT("Epic")});
		Slider(TEXT("Brightness"), St.Brightness, -2.f, 2.f, 0.25f, false, TEXT(" EV"));
		Toggle(TEXT("Fullscreen (packaged game)"), St.bFullscreen);
		Toggle(TEXT("Show FPS counter"), St.bShowFps);
		break;
	}
	S.Items.Add(Button(TEXT("Restore all defaults"), [this]() {
		Confirm(TEXT("Restore default settings?"), TEXT("All settings, including key bindings, return to their defaults."), TEXT("Restore"), [this]() {
			if (GI) GI->Settings = LBSettingsUtil::Defaults();
			PersistSettings();
		});
	}));
	S.Items.Add(Button(TEXT("Done"), [this]() { Back(); }));
	if (S.Footer.IsEmpty()) S.Footer = TEXT("Left/Right changes the highlighted setting. Changes save automatically.");
}

void FLBGame::BuildControls(FLBScreen& S)
{
	S.Title = TEXT("Controls");
	const FLBSettings& St = Settings();
	for (int32 A = 0; A < LBActionCount; A++)
	{
		if (A >= int32(ELBAction::LookLeft) && A <= int32(ELBAction::LookDown)) continue;
		const FLBBinding& B = St.Bindings.IsValidIndex(A) ? St.Bindings[A] : FLBBinding();
		TArray<FString> K, P;
		for (const FString& Key : B.Keys) K.Add(LBInput::KeyName(Key));
		for (const FString& Key : B.Pad) P.Add(LBInput::KeyName(Key));
		FLBMenuItem I;
		I.bSmall = true;
		I.bEnabled = false;
		I.Label = LBInput::ActionLabel(ELBAction(A));
		I.Value = (K.Num() ? FString::Join(K, TEXT(" / ")) : FString(TEXT("-"))) + TEXT("   |   ") + (A <= int32(ELBAction::MoveRight) ? FString(TEXT("Left stick")) : P.Num() ? FString::Join(P, TEXT(" / ")) : FString(TEXT("-")));
		S.Items.Add(I);
	}
	FLBMenuItem Cam;
	Cam.bSmall = true;
	Cam.bEnabled = false;
	Cam.Label = TEXT("Camera");
	Cam.Value = TEXT("Mouse or arrow keys   |   Right stick");
	S.Items.Add(Cam);
	S.InfoTitle = TEXT("Combat tips");
	S.InfoRows.Add(TPair<FString, FString>(TEXT("Red ground markings show exactly where an attack will land. Move out, or dodge through it - you are invulnerable mid-roll.\n\nChain light attacks into a heavy attack. Heavy hits break enemy poise and cause staggers.\n\nLanding hits builds spirit. Spend it on your weapon's spirit ability.\n\nEach weapon has its own ability. Carry two weapons and swap mid-fight."), FString()));
	S.Items.Add(Button(TEXT("Back"), [this]() { Back(); }));
	S.Footer = TEXT("Remap any binding in Settings > Controls.");
}

void FLBGame::BuildCredits(FLBScreen& S)
{
	const bool bEnding = S.Opts.Contains(TEXT("ending"));
	S.Title = TEXT("LANTERNBOUND");
	S.Subtitle = bEnding ? TEXT("The Spirit Lantern burns again. Thank you for playing.") : TEXT("Embers of Hinoyama");
	auto Line = [&S](const FString& Role, const FString& Who) {
		S.Items.Add(Header(Role));
		FLBMenuItem I;
		I.Label = Who;
		I.bEnabled = false;
		I.bSmall = true;
		S.Items.Add(I);
	};
	Line(TEXT("Game design, code, world, story & dialogue"), TEXT("Created for this project with Claude Code (AI-assisted development)"));
	Line(TEXT("Art"), TEXT("Procedural models, materials and effects generated in code"));
	Line(TEXT("Music & sound"), TEXT("Original procedural compositions and synthesised effects"));
	Line(TEXT("Built with"), TEXT("Unreal Engine 5 (C++). Original web version: three.js, Vite, TypeScript"));
	S.Items.Add(Header(TEXT("Lanternbound is an original work inspired by the broad genre of folklore action RPGs.")));
	S.Items.Add(Header(TEXT("It is not affiliated with, endorsed by, or connected to the makers of any other game.")));
	if (bEnding)
	{
		S.Items.Add(Button(TEXT("Continue exploring the valley"), [this]() { ContinueAfterEnding(); }));
		S.Items.Add(Button(TEXT("Return to title"), [this]() { QuitToTitle(); }));
	}
	else S.Items.Add(Button(TEXT("Back"), [this]() { Back(); }));
	S.Footer = FString::Printf(TEXT("Defeated: %d - Deaths: %d - Time: %s"), Data.Kills, Data.Deaths, *LBUi::FormatTime(Data.PlayTime));
}

void FLBGame::BuildDeath(FLBScreen& S)
{
	S.bTitleScreen = true;
	S.Title = TEXT("THE LANTERN GUTTERS");
	S.Subtitle = TEXT("Your light fades... but a Warden's oath is not so easily broken.");
	S.Items.Add(Button(TEXT("Rise Again (last waypoint)"), [this]() { Respawn(); }));
	S.Items.Add(Button(TEXT("Load a Save"), [this]() { OpenScreen(TEXT("load")); }));
	S.Items.Add(Button(TEXT("Quit to Title"), [this]() { QuitToTitle(); }));
	S.Footer = TEXT("Tip: watch for the red ground markings - they show exactly where an attack will land. Dodge through them!");
}

void FLBGame::BuildConfirm(FLBScreen& S)
{
	S.Title = S.Opts.Contains(TEXT("title")) ? S.Opts[TEXT("title")] : FString(TEXT("Are you sure?"));
	S.Subtitle = S.Opts.FindRef(TEXT("message"));
	const FString Yes = S.Opts.Contains(TEXT("yes")) ? S.Opts[TEXT("yes")] : FString(TEXT("Yes"));
	TFunction<void()> OnYes = S.OnYes;
	S.Items.Add(Button(Yes, [this, OnYes]() {
		Screens.Pop();
		if (OnYes) OnYes();
		if (Screens.Num() > 0) RefreshScreen();
	}));
	S.Items.Add(Button(TEXT("Cancel"), [this]() { Back(); }));
}

void FLBGame::BuildError(FLBScreen& S)
{
	S.bTitleScreen = true;
	S.Title = TEXT("Lanternbound could not start");
	S.Subtitle = FatalError;
	S.Items.Add(Button(TEXT("Quit"), [this]() {
		if (PC) UKismetSystemLibrary::QuitGame(PC, PC, EQuitPreference::Quit, false);
	}));
}
