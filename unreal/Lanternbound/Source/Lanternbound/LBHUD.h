// Canvas HUD (port of the presentation side of src/ui/ui.ts): vitals,
// minimap, quest tracker, boss bar, prompts, markers, damage numbers, toasts,
// captions, dialogue and all menu screens.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "LBHUD.generated.h"

class FLBGame;
class UFont;
struct FLBScreen;

UCLASS()
class LANTERNBOUND_API ALBHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	FLBGame* Game = nullptr;
	UFont* Font = nullptr;
	UFont* BigFont = nullptr;
	float S = 1.f; // UI scale (1 at 1080p)
	float W = 1920.f, H = 1080.f;
	float LagHp = 1.f;
	float LagBoss = 1.f;

	void Text(const FString& T, float X, float Y, const FLinearColor& C, float Scale = 1.f, bool bBig = false, bool bShadow = true);
	FVector2D Measure(const FString& T, float Scale = 1.f, bool bBig = false);
	void TextCentered(const FString& T, float CX, float Y, const FLinearColor& C, float Scale = 1.f, bool bBig = false);
	TArray<FString> Wrap(const FString& T, float MaxWidth, float Scale = 1.f, bool bBig = false);
	float Paragraph(const FString& T, float X, float Y, float MaxWidth, const FLinearColor& C, float Scale = 1.f, float LineGap = 1.15f);
	void Bar(float X, float Y, float BW, float BH, float Frac, const FLinearColor& Fill, float Lag = -1.f);
	void Panel(float X, float Y, float PW, float PH, float Alpha = 0.86f);
	bool ToScreen(const FVector& GameMetres, FVector2D& Out) const;

	void DrawVitals();
	void DrawMinimap();
	void DrawTracker();
	void DrawWeapons();
	void DrawBossBar();
	void DrawWorldMarkers();
	void DrawFloatingText();
	void DrawToasts();
	void DrawBanner();
	void DrawCaptions();
	void DrawDialogue();
	void DrawScreen(FLBScreen& Scr);
};
