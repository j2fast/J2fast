#include "LBHUD.h"
#include "LBGame.h"
#include "LBGameMode.h"
#include "LBArea.h"
#include "LBFx.h"
#include "LBData.h"
#include "LBMath.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "GameFramework/PlayerController.h"

namespace
{
	const FLinearColor Ink(0.95f, 0.91f, 0.84f);
	const FLinearColor Muted(0.66f, 0.61f, 0.69f);
	const FLinearColor Gold(1.f, 0.82f, 0.48f);
	const FLinearColor HpCol(0.85f, 0.25f, 0.22f);
	const FLinearColor StCol(0.55f, 0.82f, 0.45f);
	const FLinearColor SpCol(0.45f, 0.75f, 1.f);
	const FLinearColor XpCol(0.78f, 0.66f, 1.f);
	const FLinearColor PanelCol(0.07f, 0.05f, 0.1f);
	const FLinearColor FocusCol(1.f, 0.82f, 0.48f, 0.18f);

	FLinearColor WithAlpha(FLinearColor C, float A)
	{
		C.A *= A;
		return C;
	}

	FLinearColor ToastColor(const FString& Kind)
	{
		if (Kind == TEXT("quest")) return Gold;
		if (Kind == TEXT("error")) return FLinearColor(1.f, 0.55f, 0.48f);
		if (Kind == TEXT("item")) return FLinearColor(0.54f, 0.85f, 1.f);
		if (Kind == TEXT("progress")) return Muted;
		if (Kind.StartsWith(TEXT("rarity"))) return LBUi::RarityColor(FCString::Atoi(*Kind.Mid(6)));
		return Ink;
	}
}

// =================================================================== Primitives

FVector2D ALBHUD::Measure(const FString& T, float Scale, bool bBig)
{
	float OW = 0.f, OH = 0.f;
	GetTextSize(T, OW, OH, bBig ? BigFont : Font, Scale * S);
	return FVector2D(OW, OH);
}

void ALBHUD::Text(const FString& T, float X, float Y, const FLinearColor& C, float Scale, bool bBig, bool bShadow)
{
	if (T.IsEmpty()) return;
	UFont* F = bBig ? BigFont : Font;
	if (bShadow) DrawText(T, FLinearColor(0.f, 0.f, 0.f, C.A * 0.8f), X + 2.f * S, Y + 2.f * S, F, Scale * S);
	DrawText(T, C, X, Y, F, Scale * S);
}

void ALBHUD::TextCentered(const FString& T, float CX, float Y, const FLinearColor& C, float Scale, bool bBig)
{
	const FVector2D Sz = Measure(T, Scale, bBig);
	Text(T, CX - Sz.X / 2.f, Y, C, Scale, bBig);
}

TArray<FString> ALBHUD::Wrap(const FString& T, float MaxWidth, float Scale, bool bBig)
{
	TArray<FString> Lines;
	TArray<FString> Paragraphs;
	T.ParseIntoArray(Paragraphs, TEXT("\n"), false);
	for (const FString& P : Paragraphs)
	{
		TArray<FString> Words;
		P.ParseIntoArray(Words, TEXT(" "), true);
		FString Line;
		for (const FString& Wd : Words)
		{
			const FString Try = Line.IsEmpty() ? Wd : Line + TEXT(" ") + Wd;
			if (!Line.IsEmpty() && Measure(Try, Scale, bBig).X > MaxWidth)
			{
				Lines.Add(Line);
				Line = Wd;
			}
			else Line = Try;
		}
		Lines.Add(Line);
	}
	return Lines;
}

float ALBHUD::Paragraph(const FString& T, float X, float Y, float MaxWidth, const FLinearColor& C, float Scale, float LineGap)
{
	const float LH = Measure(TEXT("Ag"), Scale).Y * LineGap;
	for (const FString& L : Wrap(T, MaxWidth, Scale))
	{
		Text(L, X, Y, C, Scale);
		Y += LH;
	}
	return Y;
}

void ALBHUD::Bar(float X, float Y, float BW, float BH, float Frac, const FLinearColor& Fill, float Lag)
{
	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.55f), X - 2.f, Y - 2.f, BW + 4.f, BH + 4.f);
	if (Lag >= 0.f) DrawRect(FLinearColor(1.f, 0.9f, 0.7f, 0.6f), X, Y, BW * FMath::Clamp(Lag, 0.f, 1.f), BH);
	DrawRect(Fill, X, Y, BW * FMath::Clamp(Frac, 0.f, 1.f), BH);
	DrawRect(FLinearColor(1.f, 1.f, 1.f, 0.12f), X, Y, BW * FMath::Clamp(Frac, 0.f, 1.f), BH * 0.35f);
}

void ALBHUD::Panel(float X, float Y, float PW, float PH, float Alpha)
{
	DrawRect(WithAlpha(PanelCol, Alpha), X, Y, PW, PH);
	const FLinearColor Edge(0.85f, 0.55f, 0.3f, 0.6f * Alpha);
	DrawLine(X, Y, X + PW, Y, Edge, 2.f);
	DrawLine(X, Y + PH, X + PW, Y + PH, Edge, 2.f);
	DrawLine(X, Y, X, Y + PH, Edge, 2.f);
	DrawLine(X + PW, Y, X + PW, Y + PH, Edge, 2.f);
}

bool ALBHUD::ToScreen(const FVector& P, FVector2D& Out) const
{
	return PlayerOwner && PlayerOwner->ProjectWorldLocationToScreen(LB::ToWorld(P.X, P.Z, P.Y), Out, true);
}

// =================================================================== Frame

void ALBHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	ALBGameMode* GM = GetWorld() ? Cast<ALBGameMode>(GetWorld()->GetAuthGameMode()) : nullptr;
	Game = GM ? GM->GetGame() : nullptr;
	if (!Game || !GEngine) return;
	Font = GEngine->GetMediumFont();
	BigFont = GEngine->GetLargeFont();
	W = Canvas->ClipX;
	H = Canvas->ClipY;
	S = FMath::Max(0.5f, H / 1080.f);
	Game->ItemRects.Reset();
	Game->TabRects.Reset();
	Game->ChoiceRects.Reset();
	const FLBSettings& St = Game->Settings();

	const bool bPlaying = Game->Mode == ELBMode::Playing;
	if (Game->bShowHud && bPlaying && Game->Player)
	{
		DrawWorldMarkers();
		DrawFloatingText();
		DrawVitals();
		DrawMinimap();
		DrawTracker();
		DrawWeapons();
		DrawBossBar();
		// Interaction prompt
		if (!Game->InteractionLabel.IsEmpty())
		{
			const FString P = TEXT("[") + Game->Prompt(ELBAction::Interact) + TEXT("]  ") + Game->InteractionLabel;
			const FVector2D Sz = Measure(P, 1.1f);
			Panel(W / 2.f - Sz.X / 2.f - 16.f * S, H * 0.72f - 8.f * S, Sz.X + 32.f * S, Sz.Y + 16.f * S, 0.7f);
			Text(P, W / 2.f - Sz.X / 2.f, H * 0.72f, Ink, 1.1f);
		}
		// Low health pulse
		const float HpFrac = Game->Player->Hp / FMath::Max(1.f, Game->Stats().MaxHp);
		if (HpFrac < 0.3f && Game->Player->Alive() && !St.bReduceFlashing)
		{
			const float A = 0.15f + FMath::Sin(Game->Time * 6.f) * 0.08f;
			DrawRect(FLinearColor(0.6f, 0.f, 0.f, A), 0.f, 0.f, W, 24.f * S);
			DrawRect(FLinearColor(0.6f, 0.f, 0.f, A), 0.f, H - 24.f * S, W, 24.f * S);
		}
		if (Game->HintT > 0.f)
		{
			const float A = FMath::Min(1.f, Game->HintT);
			float Y = H - 120.f * S;
			TArray<FString> Lines;
			Game->HintText.ParseIntoArray(Lines, TEXT("\n"), true);
			for (const FString& L : Lines)
			{
				TextCentered(L, W / 2.f, Y, WithAlpha(Ink, A), 0.95f);
				Y += 28.f * S;
			}
		}
	}
	if (Game->DamageFlashT > 0.f)
	{
		const float A = Game->DamageFlashT * 0.6f;
		DrawRect(FLinearColor(0.7f, 0.f, 0.f, A * 0.5f), 0.f, 0.f, W, 40.f * S);
		DrawRect(FLinearColor(0.7f, 0.f, 0.f, A * 0.5f), 0.f, H - 40.f * S, W, 40.f * S);
		DrawRect(FLinearColor(0.7f, 0.f, 0.f, A * 0.5f), 0.f, 0.f, 40.f * S, H);
		DrawRect(FLinearColor(0.7f, 0.f, 0.f, A * 0.5f), W - 40.f * S, 0.f, 40.f * S, H);
	}
	if (bPlaying || Game->Mode == ELBMode::Dialogue || Game->Mode == ELBMode::Cutscene)
	{
		DrawToasts();
		DrawBanner();
	}
	DrawCaptions();
	if (Game->bDialogueOpen && !Game->TopScreen()) DrawDialogue();
	if (FLBScreen* Scr = Game->TopScreen()) DrawScreen(*Scr);
	if (Game->FadeT > 0.f) DrawRect(FLinearColor(0.f, 0.f, 0.f, FMath::Clamp(Game->FadeT / 0.6f, 0.f, 1.f)), 0.f, 0.f, W, H);
	if (St.bShowFps) Text(FString::Printf(TEXT("%d fps"), FMath::RoundToInt(Game->Fps)), W - 110.f * S, H - 34.f * S, Muted, 0.8f);
}

// =================================================================== HUD pieces

void ALBHUD::DrawVitals()
{
	const FLBPlayer& P = *Game->Player;
	const FLBStats& St = Game->Stats();
	const FLBGameData& D = Game->Data;
	const float X = 32.f * S;
	float Y = 28.f * S;
	const float BW = 380.f * S;
	Text(FString::Printf(TEXT("LANTERN WARDEN  - Lv %d"), D.Level), X, Y, Gold, 0.95f);
	Y += 30.f * S;
	const float HpFrac = FMath::Max(0.f, P.Hp / FMath::Max(1.f, St.MaxHp));
	LagHp = HpFrac > LagHp ? HpFrac : FMath::FInterpTo(LagHp, HpFrac, GetWorld()->GetDeltaSeconds(), 2.5f);
	Bar(X, Y, BW, 22.f * S, HpFrac, HpCol, LagHp);
	Text(FString::Printf(TEXT("%d / %d"), FMath::CeilToInt(P.Hp), FMath::RoundToInt(St.MaxHp)), X + 8.f * S, Y, Ink, 0.75f);
	Y += 30.f * S;
	Bar(X, Y, BW * 0.85f, 10.f * S, P.Stamina / FMath::Max(1.f, St.MaxStamina), StCol);
	Y += 18.f * S;
	const bool bReady = P.Family && P.Spirit >= P.Family->Ability.Cost;
	Bar(X, Y, BW * 0.85f, 10.f * S, P.Spirit / FMath::Max(1.f, St.MaxSpirit), bReady ? Gold : SpCol);
	Y += 20.f * S;
	FString Meta = FString::Printf(TEXT("Coins %d"), D.Coins);
	if (D.SkillPoints > 0) Meta += FString::Printf(TEXT("    * %d skill point%s"), D.SkillPoints, D.SkillPoints > 1 ? TEXT("s") : TEXT(""));
	Text(Meta, X, Y, Gold, 0.8f);
	Y += 26.f * S;
	Bar(X, Y, BW * 0.85f, 5.f * S, D.Level >= FLBRules::MaxLevel ? 1.f : float(D.Xp) / FMath::Max(1, FLBRules::XpToNext(D.Level)), XpCol);
	Y += 14.f * S;
	FString Status;
	if (P.BurnT > 0.f) Status += FString::Printf(TEXT("Burning %ds   "), FMath::CeilToInt(P.BurnT));
	if (P.SlowT > 0.f) Status += FString::Printf(TEXT("Webbed %ds   "), FMath::CeilToInt(P.SlowT));
	if (P.BuffT > 0.f) Status += FString::Printf(TEXT("Incense +%d%% %ds"), FMath::RoundToInt(P.BuffAtk * 100.f), FMath::CeilToInt(P.BuffT));
	if (!Status.IsEmpty()) Text(Status, X, Y, FLinearColor(1.f, 0.65f, 0.4f), 0.75f);
}

void ALBHUD::DrawMinimap()
{
	if (!Game->Area || !Game->Area->Data) return;
	const float R = 150.f * S;
	const float CX = W - 40.f * S - R;
	const float CY = 40.f * S + R;
	const float Scale = R / 45.f; // pixels per metre
	DrawRect(FLinearColor(0.055f, 0.04f, 0.08f, 0.6f), CX - R, CY - R, R * 2.f, R * 2.f);
	const FVector& P = Game->Player->Pos;
	const float Yaw = Game->Cam.Yaw;
	auto Tf = [&](float X, float Z, FVector2D& Out) {
		const float Dx = X - P.X;
		const float Dz = Z - P.Z;
		const float Fx = FMath::Sin(Yaw), Fz = FMath::Cos(Yaw);
		const float Forward = Dx * Fx + Dz * Fz;
		const float Right = Dx * -Fz + Dz * Fx;
		Out = FVector2D(CX - Right * Scale, CY - Forward * Scale);
		return FMath::Abs(Out.X - CX) < R && FMath::Abs(Out.Y - CY) < R;
	};
	const FLBAreaData& A = *Game->Area->Data;
	// Walkable space, sampled coarsely.
	const float Step = 4.f;
	for (float Sx = -44.f; Sx <= 44.f; Sx += Step)
	{
		for (float Sz = -44.f; Sz <= 44.f; Sz += Step)
		{
			const float Wx = P.X + Sx, Wz = P.Z + Sz;
			if (!A.IsWalkable(Wx, Wz)) continue;
			FVector2D M;
			if (!Tf(Wx, Wz, M)) continue;
			const float Half = Step * Scale * 0.55f;
			const float Mx = float(M.X), My = float(M.Y);
			const float X0 = FMath::Max(CX - R, Mx - Half), Y0 = FMath::Max(CY - R, My - Half);
			const float X1 = FMath::Min(CX + R, Mx + Half), Y1 = FMath::Min(CY + R, My + Half);
			if (X1 > X0 && Y1 > Y0) DrawRect(FLinearColor(0.47f, 0.43f, 0.35f, 0.35f), X0, Y0, X1 - X0, Y1 - Y0);
		}
	}
	auto Dot = [&](float X, float Z, const FLinearColor& C, float Size) {
		FVector2D M;
		if (Tf(X, Z, M)) DrawRect(C, M.X - Size / 2.f, M.Y - Size / 2.f, Size, Size);
	};
	for (const FLBExitDef& Ex : A.Exits) Dot(Ex.X, Ex.Z, FLinearColor(0.5f, 0.82f, 0.48f), 13.f * S);
	for (const FLBInteractObj& Io : Game->Area->Interactables)
	{
		if (!Game->Area->InteractableAvailable(Io.Def, Game->Data) && Io.Def.Kind != TEXT("wayshrine")) continue;
		const FLinearColor C = Io.Def.Kind == TEXT("chest") ? FLinearColor(1.f, 0.76f, 0.27f) : Io.Def.Kind == TEXT("wayshrine") ? FLinearColor(1.f, 0.54f, 0.42f) : FLinearColor(0.44f, 0.85f, 1.f);
		Dot(Io.Def.X, Io.Def.Z, C, 10.f * S);
	}
	for (const TUniquePtr<FLBNpc>& N : Game->Npcs) Dot(N->Pos.X, N->Pos.Z, N->Marker ? Gold : FLinearColor(0.91f, 0.88f, 0.82f), 11.f * S);
	for (const TUniquePtr<FLBEnemy>& E : Game->Enemies)
	{
		if (!E->Alive()) continue;
		Dot(E->Pos.X, E->Pos.Z, E->bBoss ? FLinearColor(1.f, 0.23f, 0.23f) : E->bAggro ? FLinearColor(1.f, 0.42f, 0.29f) : FLinearColor(0.75f, 0.31f, 0.25f), (E->bBoss ? 18.f : 9.f) * S);
	}
	const FLBWaypoint Wp = Game->Waypoint();
	if (Wp.bValid)
	{
		FVector2D M;
		Tf(Wp.Pos.X, Wp.Pos.Z, M);
		FVector2D Dlt = M - FVector2D(CX, CY);
		if (FMath::Abs(Dlt.X) > R - 14.f * S || FMath::Abs(Dlt.Y) > R - 14.f * S)
		{
			const float K = (R - 14.f * S) / FMath::Max(FMath::Abs(Dlt.X), FMath::Abs(Dlt.Y));
			M = FVector2D(CX, CY) + Dlt * K;
		}
		const float Sz = 9.f * S;
		DrawLine(M.X, M.Y - Sz, M.X + Sz, M.Y, Gold, 3.f);
		DrawLine(M.X + Sz, M.Y, M.X, M.Y + Sz, Gold, 3.f);
		DrawLine(M.X, M.Y + Sz, M.X - Sz, M.Y, Gold, 3.f);
		DrawLine(M.X - Sz, M.Y, M.X, M.Y - Sz, Gold, 3.f);
	}
	if (Game->Companion) Dot(Game->Companion->Pos.X, Game->Companion->Pos.Z, FLinearColor::White, 7.f * S);
	// Player arrow (camera forward is up).
	const float Rel = Game->Player->Yaw - Yaw;
	auto Rot = [&](float X, float Y) { return FVector2D(CX + X * FMath::Cos(-Rel) - Y * FMath::Sin(-Rel), CY + X * FMath::Sin(-Rel) + Y * FMath::Cos(-Rel)); };
	const FVector2D Tip = Rot(0.f, -14.f * S), L = Rot(-9.f * S, 10.f * S), Rr = Rot(9.f * S, 10.f * S), Back = Rot(0.f, 5.f * S);
	DrawLine(Tip.X, Tip.Y, L.X, L.Y, Gold, 3.f);
	DrawLine(L.X, L.Y, Back.X, Back.Y, Gold, 3.f);
	DrawLine(Back.X, Back.Y, Rr.X, Rr.Y, Gold, 3.f);
	DrawLine(Rr.X, Rr.Y, Tip.X, Tip.Y, Gold, 3.f);
	// Frame and area name
	const FLinearColor Edge(0.85f, 0.55f, 0.3f, 0.7f);
	DrawLine(CX - R, CY - R, CX + R, CY - R, Edge, 2.f);
	DrawLine(CX - R, CY + R, CX + R, CY + R, Edge, 2.f);
	DrawLine(CX - R, CY - R, CX - R, CY + R, Edge, 2.f);
	DrawLine(CX + R, CY - R, CX + R, CY + R, Edge, 2.f);
	TextCentered(A.Name, CX, CY + R + 8.f * S, Ink, 0.85f);
}

void ALBHUD::DrawTracker()
{
	const float X = W - 40.f * S - 300.f * S;
	float Y = 40.f * S + 300.f * S + 46.f * S;
	const FLBGameData& D = Game->Data;
	const FLBQuestDef* Q = Game->D ? Game->D->Quests.Find(D.TrackedQuest) : nullptr;
	if (Q)
	{
		Text(Q->Title, X, Y, Gold, 0.9f);
		Y += 28.f * S;
		Y = Paragraph(FLBRules::ObjectiveText(*Game->D, D, D.TrackedQuest), X, Y, 300.f * S, Ink, 0.8f);
		if (const FLBObjective* O = FLBRules::CurrentObjective(*Game->D, D, D.TrackedQuest))
		{
			if (!O->Hint.IsEmpty()) Paragraph(Game->WithPrompts(O->Hint), X, Y + 2.f * S, 300.f * S, Muted, 0.72f);
		}
	}
	else if (D.bEnding)
	{
		Text(TEXT("The Lantern burns"), X, Y, Gold, 0.9f);
		Text(TEXT("Explore freely, Warden."), X, Y + 28.f * S, Ink, 0.8f);
	}
}

void ALBHUD::DrawWeapons()
{
	const FLBGameData& D = Game->Data;
	const FLBPlayer& P = *Game->Player;
	const float BX = W - 40.f * S;
	const float Y = H - 150.f * S;
	float X = BX - 560.f * S;
	auto Slot = [&](const FString& Uid, bool bActive) {
		const FLBItemInstance* I = FLBRules::FindItemConst(D, Uid);
		Panel(X, Y, 130.f * S, 100.f * S, bActive ? 0.9f : 0.55f);
		if (I)
		{
			const FLBItemDef* Def = Game->D->Item(I->Id);
			if (bActive) DrawRect(WithAlpha(LBUi::RarityColor(I->Rarity), 0.25f), X, Y, 130.f * S, 100.f * S);
			const FLBWeaponFamily* Fam = Def ? Game->D->Weapons.Find(Def->WeaponType) : nullptr;
			Text(Fam ? Fam->Name : FString(TEXT("?")), X + 8.f * S, Y + 8.f * S, LBUi::RarityColor(I->Rarity), 0.75f);
			Paragraph(Def ? Def->Name : I->Id, X + 8.f * S, Y + 34.f * S, 116.f * S, Ink, 0.62f, 1.05f);
			if (I->Level > 0) Text(FString::Printf(TEXT("+%d"), I->Level), X + 100.f * S, Y + 8.f * S, Gold, 0.7f);
			if (!bActive) Text(TEXT("[") + Game->Prompt(ELBAction::SwapWeapon) + TEXT("]"), X + 8.f * S, Y + 74.f * S, Muted, 0.65f);
		}
		else Text(TEXT("-"), X + 58.f * S, Y + 36.f * S, Muted);
		X += 140.f * S;
	};
	Slot(D.Weapon1, D.ActiveWeapon == 0);
	Slot(D.Weapon2, D.ActiveWeapon == 1);
	// Ability
	if (P.Family)
	{
		const FLBAbilityDef& Ab = P.Family->Ability;
		const float Cd = P.AbilityCd.FindRef(P.WeaponType);
		const bool bReady = Cd <= 0.f && P.Spirit >= Ab.Cost;
		Panel(X, Y, 150.f * S, 100.f * S, 0.85f);
		const float Fill = Cd > 0.f ? 1.f - Cd / FMath::Max(0.1f, Ab.Cooldown) : FMath::Min(1.f, P.Spirit / FMath::Max(1.f, Ab.Cost));
		DrawRect(WithAlpha(bReady ? Gold : SpCol, 0.25f), X, Y + 100.f * S * (1.f - Fill), 150.f * S, 100.f * S * Fill);
		Paragraph(Ab.Name, X + 8.f * S, Y + 8.f * S, 134.f * S, bReady ? Gold : Ink, 0.7f, 1.05f);
		Text(Cd > 0.f ? FString::Printf(TEXT("%.1fs"), Cd) : FString::Printf(TEXT("%d spirit"), FMath::RoundToInt(Ab.Cost)), X + 8.f * S, Y + 52.f * S, Muted, 0.65f);
		Text(TEXT("[") + Game->Prompt(ELBAction::Ability) + TEXT("]"), X + 8.f * S, Y + 74.f * S, Ink, 0.65f);
		X += 160.f * S;
	}
	// Healing dango
	Panel(X, Y, 120.f * S, 100.f * S, 0.85f);
	Text(TEXT("Dango"), X + 8.f * S, Y + 8.f * S, FLinearColor(0.54f, 1.f, 0.6f), 0.75f);
	Text(FString::Printf(TEXT("x%d"), FLBRules::CountItem(D, TEXT("dango"))), X + 8.f * S, Y + 36.f * S, Ink, 1.1f);
	Text(TEXT("[") + Game->Prompt(ELBAction::Heal) + TEXT("]"), X + 8.f * S, Y + 74.f * S, Ink, 0.65f);
}

void ALBHUD::DrawBossBar()
{
	const FLBEnemy* B = Game->BossBar;
	if (!B) return;
	const float BW = 760.f * S;
	const float X = W / 2.f - BW / 2.f;
	const float Y = 36.f * S;
	TextCentered(B->Def.BossTitle, W / 2.f, Y, Muted, 0.75f);
	TextCentered(B->Def.Name, W / 2.f, Y + 22.f * S, Gold, 1.15f);
	const float F = FMath::Max(0.f, B->Hp / FMath::Max(1.f, B->MaxHp));
	LagBoss = F > LagBoss ? F : FMath::FInterpTo(LagBoss, F, GetWorld()->GetDeltaSeconds(), 2.f);
	Bar(X, Y + 58.f * S, BW, 16.f * S, F, FLinearColor(0.8f, 0.18f, 0.22f), LagBoss);
	const int32 Phases = B->Def.PhaseThresholds.Num() + 1;
	if (Phases > 1) TextCentered(FString::Printf(TEXT("Phase %d / %d"), B->Phase, Phases), W / 2.f, Y + 80.f * S, Muted, 0.7f);
}

void ALBHUD::DrawWorldMarkers()
{
	// NPC quest markers
	for (const TUniquePtr<FLBNpc>& N : Game->Npcs)
	{
		if (!N->Marker) continue;
		FVector2D Sc;
		if (!ToScreen(FVector(N->Pos.X, N->Pos.Y + N->Height() + 0.6f + FMath::Sin(Game->Time * 3.f) * 0.08f, N->Pos.Z), Sc)) continue;
		const FString Sym = N->Marker == 1 ? TEXT("!") : TEXT("?");
		const FLinearColor C = N->Marker == 1 ? Gold : FLinearColor(0.54f, 0.85f, 1.f);
		DrawRect(FLinearColor(0.08f, 0.05f, 0.1f, 0.85f), Sc.X - 16.f * S, Sc.Y - 16.f * S, 32.f * S, 32.f * S);
		TextCentered(Sym, Sc.X, Sc.Y - 16.f * S, C, 1.2f, true);
	}
	// Lock-on reticle
	if (const FLBEnemy* L = Game->Player->LockTarget)
	{
		FVector2D Sc;
		if (L->Alive() && ToScreen(FVector(L->Pos.X, L->Pos.Y + L->AimHeight(), L->Pos.Z), Sc))
		{
			const float R = 18.f * S;
			const FLinearColor C(1.f, 0.85f, 0.5f);
			DrawLine(Sc.X - R, Sc.Y, Sc.X - R * 0.4f, Sc.Y, C, 3.f);
			DrawLine(Sc.X + R * 0.4f, Sc.Y, Sc.X + R, Sc.Y, C, 3.f);
			DrawLine(Sc.X, Sc.Y - R, Sc.X, Sc.Y - R * 0.4f, C, 3.f);
			DrawLine(Sc.X, Sc.Y + R * 0.4f, Sc.X, Sc.Y + R, C, 3.f);
			// Small health bar over the target.
			if (!L->bBoss) Bar(Sc.X - 40.f * S, Sc.Y - 40.f * S, 80.f * S, 6.f * S, L->Hp / FMath::Max(1.f, L->MaxHp), HpCol);
		}
	}
	// Waypoint
	const FLBWaypoint Wp = Game->Waypoint();
	if (Wp.bValid)
	{
		const float Dist = FMath::Sqrt(FMath::Square(Wp.Pos.X - Game->Player->Pos.X) + FMath::Square(Wp.Pos.Z - Game->Player->Pos.Z));
		if (Dist > 3.f)
		{
			FVector2D Sc;
			const bool bFront = ToScreen(FVector(Wp.Pos.X, Wp.Pos.Y + 2.2f, Wp.Pos.Z), Sc);
			if (!bFront)
			{
				Sc.X = W - Sc.X;
				Sc.Y = H - 160.f * S;
			}
			Sc.X = FMath::Clamp(float(Sc.X), 60.f * S, W - 60.f * S);
			Sc.Y = FMath::Clamp(float(Sc.Y), 170.f * S, H - 150.f * S);
			const float Sz = 10.f * S;
			DrawLine(Sc.X, Sc.Y - Sz, Sc.X + Sz, Sc.Y, Gold, 3.f);
			DrawLine(Sc.X + Sz, Sc.Y, Sc.X, Sc.Y + Sz, Gold, 3.f);
			DrawLine(Sc.X, Sc.Y + Sz, Sc.X - Sz, Sc.Y, Gold, 3.f);
			DrawLine(Sc.X - Sz, Sc.Y, Sc.X, Sc.Y - Sz, Gold, 3.f);
			TextCentered(FString::Printf(TEXT("%d m"), FMath::RoundToInt(Dist)), Sc.X, Sc.Y + 14.f * S, Gold, 0.75f);
		}
	}
}

void ALBHUD::DrawFloatingText()
{
	if (!Game->Fx) return;
	for (const FLBFloatText& F : Game->Fx->Floats)
	{
		FVector2D Sc;
		if (!PlayerOwner || !PlayerOwner->ProjectWorldLocationToScreen(F.Pos, Sc, true)) continue;
		const float A = F.T < 0.1f ? F.T / 0.1f : 1.f - FMath::Max(0.f, (F.T - F.Life * 0.6f) / (F.Life * 0.4f));
		const float Pop = F.T < 0.12f ? 1.4f - F.T * 3.f : 1.f;
		TextCentered(F.Text, Sc.X, Sc.Y, WithAlpha(F.Color, FMath::Clamp(A, 0.f, 1.f)), F.Scale * Pop * 1.05f, true);
	}
}

void ALBHUD::DrawToasts()
{
	float Y = H * 0.42f;
	const float X = W - 40.f * S;
	for (const FLBToast& T : Game->Toasts)
	{
		const float A = T.T > 4.2f ? FMath::Max(0.f, 1.f - (T.T - 4.2f) / 0.5f) : FMath::Min(1.f, T.T * 6.f);
		const FVector2D Sz = Measure(T.Text, 0.8f);
		DrawRect(FLinearColor(0.06f, 0.04f, 0.08f, 0.7f * A), X - Sz.X - 24.f * S, Y - 4.f * S, Sz.X + 24.f * S, Sz.Y + 8.f * S);
		DrawRect(WithAlpha(ToastColor(T.Kind), A), X - Sz.X - 24.f * S, Y - 4.f * S, 4.f * S, Sz.Y + 8.f * S);
		Text(T.Text, X - Sz.X - 12.f * S, Y, WithAlpha(ToastColor(T.Kind), A), 0.8f);
		Y += Sz.Y + 14.f * S;
	}
}

void ALBHUD::DrawBanner()
{
	if (Game->BannerT <= 0.f) return;
	const float A = FMath::Min(1.f, Game->BannerT / 0.5f);
	const float Y = H * 0.2f;
	TextCentered(Game->BannerTitle, W / 2.f, Y, WithAlpha(Gold, A), 1.7f, true);
	if (!Game->BannerSub.IsEmpty()) TextCentered(Game->BannerSub, W / 2.f, Y + 56.f * S, WithAlpha(Ink, A), 0.95f);
}

void ALBHUD::DrawCaptions()
{
	const FLBSettings& St = Game->Settings();
	static const float Sizes[] = {0.8f, 1.f, 1.25f, 1.5f};
	const float TS = Sizes[FMath::Clamp(St.SubtitleSize, 0, 3)];
	float Y = H - (Game->bDialogueOpen ? 330.f : 210.f) * S;
	for (int32 I = Game->Captions.Num() - 1; I >= 0; I--)
	{
		const FLBCaption& C = Game->Captions[I];
		const float A = C.T > C.Life ? FMath::Max(0.f, 1.f - (C.T - C.Life) / 0.45f) : 1.f;
		const FString Line = C.Speaker.IsEmpty() ? C.Text : C.Speaker + TEXT(": ") + C.Text;
		const FVector2D Sz = Measure(Line, TS);
		DrawRect(FLinearColor(0.f, 0.f, 0.f, St.SubtitleBackground * A), W / 2.f - Sz.X / 2.f - 14.f * S, Y - 4.f * S, Sz.X + 28.f * S, Sz.Y + 8.f * S);
		TextCentered(Line, W / 2.f, Y, WithAlpha(C.bSound ? FLinearColor(0.54f, 0.85f, 1.f) : (C.Speaker.IsEmpty() ? Ink : Gold), A), TS);
		Y -= Sz.Y + 14.f * S;
	}
}

void ALBHUD::DrawDialogue()
{
	const FLBSettings& St = Game->Settings();
	static const float Sizes[] = {0.85f, 1.f, 1.2f, 1.4f};
	const float TS = Sizes[FMath::Clamp(St.SubtitleSize, 0, 3)];
	const float PW = FMath::Min(1200.f * S, W * 0.9f);
	const float X = W / 2.f - PW / 2.f;
	const int32 NChoices = Game->DialogueChoices.Num();
	const float PH = (170.f + NChoices * 40.f) * S;
	const float Y = H - PH - 40.f * S;
	Panel(X, Y, PW, PH, 0.9f);
	if (!Game->DialogueSpeaker.IsEmpty()) Text(Game->DialogueSpeaker, X + 24.f * S, Y + 14.f * S, Gold, 1.05f);
	const FString Shown = Game->DialogueText.Left(FMath::FloorToInt(Game->DialogueShown));
	Paragraph(Shown, X + 24.f * S, Y + 50.f * S, PW - 48.f * S, Ink, TS);
	if (NChoices > 0)
	{
		float CY = Y + PH - (NChoices * 40.f + 14.f) * S;
		for (int32 I = 0; I < NChoices; I++)
		{
			const bool bFocus = I == Game->ChoiceFocus;
			const FBox2D Box(FVector2D(X + 20.f * S, CY - 4.f * S), FVector2D(X + PW - 20.f * S, CY + 34.f * S));
			if (bFocus) DrawRect(FocusCol, Box.Min.X, Box.Min.Y, Box.Max.X - Box.Min.X, Box.Max.Y - Box.Min.Y);
			Text(FString::Printf(TEXT("%d. %s"), I + 1, *Game->DialogueChoices[I]), X + 32.f * S, CY, bFocus ? Gold : Ink, 0.95f);
			Game->ChoiceRects.Add(TPair<int32, FBox2D>(I, Box));
			CY += 40.f * S;
		}
	}
	else if (!Game->bDialogueCinematic)
	{
		const FString Next = TEXT("[") + Game->Prompt(ELBAction::Interact) + TEXT("] >");
		const FVector2D Sz = Measure(Next, 0.8f);
		Text(Next, X + PW - Sz.X - 24.f * S, Y + PH - Sz.Y - 14.f * S, Muted, 0.8f);
	}
}

// =================================================================== Screens

void ALBHUD::DrawScreen(FLBScreen& Scr)
{
	const bool bCapturing = Game->PC && Game->PC->IsCapturing();
	if (Scr.bTitleScreen)
	{
		// Title / death / error: full-screen vignette with a centred menu.
		DrawRect(FLinearColor(0.f, 0.f, 0.f, Scr.Name == TEXT("title") ? 0.25f : 0.6f), 0.f, 0.f, W, H);
		const bool bTitle = Scr.Name == TEXT("title");
		TextCentered(Scr.Title, W / 2.f, H * 0.18f, bTitle ? Gold : FLinearColor(1.f, 0.55f, 0.48f), bTitle ? 2.6f : 1.8f, true);
		float Y = H * 0.18f + (bTitle ? 100.f : 70.f) * S;
		if (!Scr.Subtitle.IsEmpty())
		{
			for (const FString& L : Wrap(Scr.Subtitle, FMath::Min(1100.f * S, W * 0.9f), 1.f))
			{
				TextCentered(L, W / 2.f, Y, Ink, 1.f);
				Y += 30.f * S;
			}
		}
		Y = FMath::Max(Y + 30.f * S, H * 0.45f);
		for (int32 I = 0; I < Scr.Items.Num(); I++)
		{
			const FLBMenuItem& It = Scr.Items[I];
			const bool bFocus = I == Scr.Focus;
			const FVector2D Sz = Measure(It.Label, 1.15f);
			const FBox2D Box(FVector2D(W / 2.f - 220.f * S, Y - 6.f * S), FVector2D(W / 2.f + 220.f * S, Y + Sz.Y + 6.f * S));
			DrawRect(bFocus ? FLinearColor(1.f, 0.82f, 0.48f, 0.22f) : FLinearColor(0.06f, 0.04f, 0.08f, 0.55f), Box.Min.X, Box.Min.Y, Box.Max.X - Box.Min.X, Box.Max.Y - Box.Min.Y);
			TextCentered(It.Label, W / 2.f, Y, !It.bEnabled ? Muted : bFocus ? Gold : Ink, 1.15f);
			Game->ItemRects.Add(TPair<int32, FBox2D>(I, Box));
			Y += Sz.Y + 18.f * S;
		}
		if (!Scr.Footer.IsEmpty()) TextCentered(Scr.Footer, W / 2.f, H - 60.f * S, Muted, 0.75f);
		return;
	}

	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.45f), 0.f, 0.f, W, H);
	bool bHasDetails = !Scr.InfoTitle.IsEmpty() || Scr.InfoRows.Num() > 0;
	for (const FLBMenuItem& It : Scr.Items) bHasDetails |= !It.Detail.IsEmpty();
	const float PW = FMath::Min((bHasDetails ? 1400.f : 760.f) * S, W * 0.94f);
	const float PH = FMath::Min(900.f * S, H * 0.9f);
	const float PX = W / 2.f - PW / 2.f;
	const float PY = H / 2.f - PH / 2.f;
	Panel(PX, PY, PW, PH, 0.92f);
	float Y = PY + 22.f * S;
	Text(Scr.Title, PX + 30.f * S, Y, Gold, 1.5f, true);
	Y += 64.f * S;
	const float ListW = bHasDetails ? PW * 0.56f : PW - 60.f * S;
	if (!Scr.Subtitle.IsEmpty()) Y = Paragraph(Scr.Subtitle, PX + 30.f * S, Y, PW - 60.f * S, Muted, 0.85f) + 8.f * S;
	if (Scr.Tabs.Num() > 0)
	{
		float TX = PX + 30.f * S;
		for (int32 I = 0; I < Scr.Tabs.Num(); I++)
		{
			const FVector2D Sz = Measure(Scr.Tabs[I], 0.9f);
			const FBox2D Box(FVector2D(TX, Y - 4.f * S), FVector2D(TX + Sz.X + 24.f * S, Y + Sz.Y + 4.f * S));
			DrawRect(I == Scr.Tab ? FLinearColor(1.f, 0.82f, 0.48f, 0.3f) : FLinearColor(1.f, 1.f, 1.f, 0.06f), Box.Min.X, Box.Min.Y, Box.Max.X - Box.Min.X, Box.Max.Y - Box.Min.Y);
			Text(Scr.Tabs[I], TX + 12.f * S, Y, I == Scr.Tab ? Gold : Ink, 0.9f);
			Game->TabRects.Add(TPair<int32, FBox2D>(I, Box));
			TX = Box.Max.X + 10.f * S;
		}
		Y += 44.f * S;
	}
	// List with scrolling
	const float ListTop = Y;
	const float ListBottom = PY + PH - 64.f * S;
	auto RowH = [this](const FLBMenuItem& It) { return (It.bHeader ? 34.f : It.bSmall ? 30.f : 40.f) * S; };
	// Keep the focused row visible.
	Scr.Scroll = FMath::Clamp(Scr.Scroll, 0, FMath::Max(0, Scr.Items.Num() - 1));
	if (Scr.Focus < Scr.Scroll) Scr.Scroll = Scr.Focus;
	for (;;)
	{
		float Hh = 0.f;
		for (int32 I = Scr.Scroll; I <= Scr.Focus && I < Scr.Items.Num(); I++) Hh += RowH(Scr.Items[I]);
		if (Hh <= ListBottom - ListTop || Scr.Scroll >= Scr.Focus) break;
		Scr.Scroll++;
	}
	if (Scr.Scroll > 0) Text(TEXT("^"), PX + 30.f * S + ListW - 20.f * S, ListTop - 26.f * S, Muted, 0.8f);
	float RY = ListTop;
	int32 Last = Scr.Scroll;
	for (int32 I = Scr.Scroll; I < Scr.Items.Num(); I++)
	{
		const FLBMenuItem& It = Scr.Items[I];
		const float Rh = RowH(It);
		if (RY + Rh > ListBottom) break;
		Last = I;
		const bool bFocus = I == Scr.Focus && !It.bHeader;
		const FBox2D Box(FVector2D(PX + 24.f * S, RY), FVector2D(PX + 30.f * S + ListW, RY + Rh - 4.f * S));
		if (bFocus) DrawRect(FocusCol, Box.Min.X, Box.Min.Y, Box.Max.X - Box.Min.X, Box.Max.Y - Box.Min.Y);
		const float Ts = It.bHeader ? 0.85f : It.bSmall ? 0.78f : 0.95f;
		FLinearColor C = It.bHeader ? Gold : It.Color;
		if (!It.bEnabled && !It.bHeader) C = WithAlpha(C, 0.55f);
		Text(It.Label, PX + 36.f * S, RY + 4.f * S, C, Ts);
		if (!It.Value.IsEmpty())
		{
			const FVector2D Vs = Measure(It.Value, Ts * 0.9f);
			Text(It.Value, Box.Max.X - Vs.X - 10.f * S, RY + 5.f * S, bFocus ? Gold : Muted, Ts * 0.9f);
		}
		if (!It.bHeader) Game->ItemRects.Add(TPair<int32, FBox2D>(I, Box));
		RY += Rh;
	}
	if (Last < Scr.Items.Num() - 1) Text(TEXT("v"), PX + 30.f * S + ListW - 20.f * S, ListBottom - 10.f * S, Muted, 0.8f);

	// Details / info panel
	if (bHasDetails)
	{
		const float DX = PX + 30.f * S + ListW + 30.f * S;
		const float DW = PX + PW - 30.f * S - DX;
		float DY = ListTop;
		DrawRect(FLinearColor(1.f, 1.f, 1.f, 0.04f), DX - 12.f * S, DY - 8.f * S, DW + 24.f * S, ListBottom - DY);
		const FLBMenuItem* Focused = Scr.Items.IsValidIndex(Scr.Focus) ? &Scr.Items[Scr.Focus] : nullptr;
		if (Focused && !Focused->Detail.IsEmpty())
		{
			Text(Focused->Label, DX, DY, Focused->bHeader ? Gold : Focused->Color, 0.95f);
			DY = Paragraph(Focused->Detail, DX, DY + 36.f * S, DW, Ink, 0.8f) + 14.f * S;
		}
		if (!Scr.InfoTitle.IsEmpty() && DY < ListBottom - 60.f * S)
		{
			Text(Scr.InfoTitle, DX, DY, Gold, 0.9f);
			DY += 34.f * S;
			for (const TPair<FString, FString>& R : Scr.InfoRows)
			{
				if (DY > ListBottom - 30.f * S) break;
				if (R.Value.IsEmpty()) DY = Paragraph(R.Key, DX, DY, DW, Ink, 0.78f) + 6.f * S;
				else
				{
					Text(R.Key, DX, DY, Muted, 0.78f);
					const FVector2D Vs = Measure(R.Value, 0.78f);
					Text(R.Value, DX + DW - Vs.X, DY, Ink, 0.78f);
					DY += 27.f * S;
				}
			}
		}
	}
	// Footer
	if (bCapturing) Text(TEXT("Press the new key or button...   (Esc cancels)"), PX + 30.f * S, PY + PH - 46.f * S, Gold, 0.85f);
	else if (!Scr.Footer.IsEmpty()) Paragraph(Scr.Footer, PX + 30.f * S, PY + PH - 50.f * S, PW - 60.f * S, Muted, 0.72f);
}
