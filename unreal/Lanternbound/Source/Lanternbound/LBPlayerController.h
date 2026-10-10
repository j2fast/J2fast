// Player controller: polls the remappable bindings (keyboard, mouse and
// gamepad) every frame, like src/core/input.ts, and produces input frames for
// the fixed-step simulation plus navigation events for the menus.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "LBSettings.h"
#include "LBPlayerController.generated.h"

struct FLBInputFrame
{
	float MoveX = 0.f; // -1 left .. 1 right
	float MoveY = 0.f; // -1 back .. 1 forward
	float LookX = 0.f; // camera yaw delta (radians-ish)
	float LookY = 0.f;
	bool Down[LBActionCount] = {};
	bool Pressed[LBActionCount] = {};
	bool Released[LBActionCount] = {};

	bool IsDown(ELBAction A) const { return Down[int32(A)]; }
	bool WasPressed(ELBAction A) const { return Pressed[int32(A)]; }
};

enum class ELBNav : uint8 { Up, Down, Left, Right, Confirm, Back, TabNext, TabPrev };

UCLASS()
class LANTERNBOUND_API ALBPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	ALBPlayerController();
	virtual void BeginPlay() override;
	virtual void PlayerTick(float DeltaTime) override;

	/** Builds the input frame for one simulation step (consumes queued presses). */
	FLBInputFrame Sample(float Dt);
	/** Menu navigation events since the last call. */
	TArray<ELBNav> TakeNav();
	/** Forget held keys and queued presses (after closing menus etc.). */
	void ClearAll();

	/** Menus show the mouse cursor; gameplay captures it. */
	void SetMenuMode(bool bMenu);
	bool IsMenuMode() const { return bMenuMode; }

	bool bGamepad = false;
	/** Prompt text for an action on the current device, e.g. "E" or "A". */
	FString Prompt(ELBAction A) const;

	// Mouse for menus
	FVector2D MousePos = FVector2D::ZeroVector;
	bool bMouseMoved = false;
	bool bMouseClicked = false;
	float Wheel = 0.f;
	/** Number keys 1-9 pressed this frame (dialogue choices), else -1. */
	int32 NumberPressed = -1;

	/** Rebinding: the next key / button pressed is reported to Captured. */
	void BeginCapture() { bCapturing = true; CapturedKey.Empty(); }
	void CancelCapture() { bCapturing = false; }
	bool IsCapturing() const { return bCapturing; }
	/** Set when a capture finished: key name and whether it was a gamepad key. */
	FString CapturedKey;
	bool bCapturedPad = false;

private:
	bool bMenuMode = true;
	bool bCapturing = false;
	TMap<FName, bool> PrevKeyDown;
	bool PendingPressed[LBActionCount] = {};
	bool PrevDown[LBActionCount] = {};
	float MouseDX = 0.f;
	float MouseDY = 0.f;
	TArray<ELBNav> NavQueue;
	bool NavHeld[4] = {};
	float NavRepeat = 0.f;
	TArray<FKey> AllKeys;

	const FLBSettings& Settings() const;
	bool KeyDown(const FString& Name) const;
	bool KeyPressedEdge(const FKey& Key);
	void PollCapture();
	void PollNav(float Dt);
};
