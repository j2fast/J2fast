#include "LBPlayerController.h"
#include "LBGameInstance.h"
#include "InputCoreTypes.h"

ALBPlayerController::ALBPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = false;
	bShouldPerformFullTickWhenPaused = true;
	PrimaryActorTick.bTickEvenWhenPaused = true;
}

void ALBPlayerController::BeginPlay()
{
	Super::BeginPlay();
	EKeys::GetAllKeys(AllKeys);
	SetMenuMode(true);
}

const FLBSettings& ALBPlayerController::Settings() const
{
	static FLBSettings Fallback = LBSettingsUtil::Defaults();
	const ULBGameInstance* GI = ULBGameInstance::Get(this);
	return GI ? GI->Settings : Fallback;
}

void ALBPlayerController::SetMenuMode(bool bMenu)
{
	bMenuMode = bMenu;
	bShowMouseCursor = bMenu;
	if (bMenu)
	{
		FInputModeGameAndUI Mode;
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		Mode.SetHideCursorDuringCapture(false);
		SetInputMode(Mode);
	}
	else
	{
		SetInputMode(FInputModeGameOnly());
	}
}

bool ALBPlayerController::KeyDown(const FString& Name) const
{
	if (Name.IsEmpty()) return false;
	const FKey Key{FName(*Name)};
	if (!Key.IsValid()) return false;
	if (Key.IsAxis1D() || Key == EKeys::Gamepad_LeftTrigger || Key == EKeys::Gamepad_RightTrigger)
	{
		// Triggers report as buttons too, but read the analog value to be safe.
		if (Key == EKeys::Gamepad_LeftTrigger) return IsInputKeyDown(Key) || GetInputAnalogKeyState(EKeys::Gamepad_LeftTriggerAxis) > 0.5f;
		if (Key == EKeys::Gamepad_RightTrigger) return IsInputKeyDown(Key) || GetInputAnalogKeyState(EKeys::Gamepad_RightTriggerAxis) > 0.5f;
	}
	return IsInputKeyDown(Key);
}

bool ALBPlayerController::KeyPressedEdge(const FKey& Key)
{
	const bool bDown = IsInputKeyDown(Key);
	bool& Prev = PrevKeyDown.FindOrAdd(Key.GetFName());
	const bool bEdge = (bDown && !Prev) || WasInputKeyJustPressed(Key);
	Prev = bDown;
	return bEdge;
}

static float Deadzone(float V)
{
	const float A = FMath::Abs(V);
	if (A < 0.18f) return 0.f;
	return FMath::Sign(V) * (A - 0.18f) / (1.f - 0.18f);
}

void ALBPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	const FLBSettings& S = Settings();

	// Device detection
	const float LX = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_LeftX));
	const float LY = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_LeftY));
	bool bAnyPad = FMath::Abs(LX) > 0.3f || FMath::Abs(LY) > 0.3f;
	bool bAnyKbm = false;

	if (bCapturing)
	{
		PollCapture();
		PrevKeyDown.Reset();
		return;
	}

	// Action presses accumulate until the simulation samples them.
	for (int32 A = 0; A < LBActionCount && A < S.Bindings.Num(); A++)
	{
		for (const FString& Name : S.Bindings[A].Keys)
		{
			const FKey Key{FName(*Name)};
			if (Key.IsValid() && KeyPressedEdge(Key))
			{
				PendingPressed[A] = true;
				bAnyKbm = true;
			}
		}
		for (const FString& Name : S.Bindings[A].Pad)
		{
			const FKey Key{FName(*Name)};
			if (Key.IsValid() && KeyPressedEdge(Key))
			{
				PendingPressed[A] = true;
				bAnyPad = true;
			}
		}
	}

	float DX = 0.f, DY = 0.f;
	GetInputMouseDelta(DX, DY);
	if (!bMenuMode)
	{
		MouseDX += DX;
		MouseDY += DY;
	}
	if (FMath::Abs(DX) + FMath::Abs(DY) > 2.f) bAnyKbm = true;

	// Menu mouse
	float MX = 0.f, MY = 0.f;
	if (GetMousePosition(MX, MY))
	{
		bMouseMoved = FVector2D(MX, MY) != MousePos;
		MousePos = FVector2D(MX, MY);
	}
	bMouseClicked = WasInputKeyJustPressed(EKeys::LeftMouseButton);
	Wheel = WasInputKeyJustPressed(EKeys::MouseScrollUp) ? 1.f : WasInputKeyJustPressed(EKeys::MouseScrollDown) ? -1.f : 0.f;
	NumberPressed = -1;
	static const FKey Numbers[] = {EKeys::One, EKeys::Two, EKeys::Three, EKeys::Four, EKeys::Five, EKeys::Six, EKeys::Seven, EKeys::Eight, EKeys::Nine};
	for (int32 I = 0; I < 9; I++)
	{
		if (WasInputKeyJustPressed(Numbers[I])) NumberPressed = I;
	}
	if (bMouseClicked) bAnyKbm = true;

	PollNav(DeltaTime);

	if (bAnyPad && !bGamepad) bGamepad = true;
	else if (bAnyKbm && bGamepad) bGamepad = false;
}

void ALBPlayerController::PollNav(float Dt)
{
	auto Edge = [this](const FKey& K) { return WasInputKeyJustPressed(K); };
	// Confirm / back / tabs
	if (Edge(EKeys::Enter) || Edge(EKeys::SpaceBar) || Edge(EKeys::Gamepad_FaceButton_Bottom)) NavQueue.Add(ELBNav::Confirm);
	if (Edge(EKeys::Escape) || Edge(EKeys::BackSpace) || Edge(EKeys::Gamepad_FaceButton_Right) || Edge(EKeys::Gamepad_Special_Right)) NavQueue.Add(ELBNav::Back);
	if (Edge(EKeys::Gamepad_RightShoulder) || Edge(EKeys::PageDown)) NavQueue.Add(ELBNav::TabNext);
	if (Edge(EKeys::Gamepad_LeftShoulder) || Edge(EKeys::PageUp)) NavQueue.Add(ELBNav::TabPrev);

	// Directions with auto-repeat (keyboard arrows / WASD, D-pad, left stick).
	const float AX = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_LeftX));
	const float AY = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_LeftY));
	const bool Dir[4] = {
		IsInputKeyDown(EKeys::Up) || IsInputKeyDown(EKeys::W) || IsInputKeyDown(EKeys::Gamepad_DPad_Up) || AY > 0.5f,
		IsInputKeyDown(EKeys::Down) || IsInputKeyDown(EKeys::S) || IsInputKeyDown(EKeys::Gamepad_DPad_Down) || AY < -0.5f,
		IsInputKeyDown(EKeys::Left) || IsInputKeyDown(EKeys::A) || IsInputKeyDown(EKeys::Gamepad_DPad_Left) || AX < -0.5f,
		IsInputKeyDown(EKeys::Right) || IsInputKeyDown(EKeys::D) || IsInputKeyDown(EKeys::Gamepad_DPad_Right) || AX > 0.5f,
	};
	const ELBNav Navs[4] = {ELBNav::Up, ELBNav::Down, ELBNav::Left, ELBNav::Right};
	NavRepeat -= Dt;
	bool bAny = false;
	for (int32 I = 0; I < 4; I++)
	{
		if (Dir[I] && (!NavHeld[I] || NavRepeat <= 0.f))
		{
			NavQueue.Add(Navs[I]);
			NavRepeat = NavHeld[I] ? 0.12f : 0.35f;
		}
		NavHeld[I] = Dir[I];
		bAny |= Dir[I];
	}
	if (Edge(EKeys::Tab)) NavQueue.Add(IsInputKeyDown(EKeys::LeftShift) ? ELBNav::Up : ELBNav::Down);
	if (!bAny) NavRepeat = 0.f;
}

void ALBPlayerController::PollCapture()
{
	if (WasInputKeyJustPressed(EKeys::Escape))
	{
		// Escape cancels rebinding.
		bCapturing = false;
		CapturedKey = TEXT("__cancel");
		return;
	}
	for (const FKey& K : AllKeys)
	{
		if (K.IsAxis1D() || K.IsAxis2D() || K.IsAxis3D() || K.IsTouch() || K.IsGesture()) continue;
		if (K == EKeys::MouseX || K == EKeys::MouseY || K == EKeys::AnyKey) continue;
		if (!WasInputKeyJustPressed(K)) continue;
		bCapturing = false;
		CapturedKey = K.GetFName().ToString();
		bCapturedPad = K.IsGamepadKey();
		ClearAll();
		return;
	}
}

FLBInputFrame ALBPlayerController::Sample(float Dt)
{
	FLBInputFrame F;
	const FLBSettings& S = Settings();
	for (int32 A = 0; A < LBActionCount && A < S.Bindings.Num(); A++)
	{
		bool bDown = false;
		for (const FString& K : S.Bindings[A].Keys) bDown |= KeyDown(K);
		for (const FString& K : S.Bindings[A].Pad) bDown |= KeyDown(K);
		F.Down[A] = bDown || PendingPressed[A];
		F.Pressed[A] = PendingPressed[A];
		F.Released[A] = !F.Down[A] && PrevDown[A];
		PrevDown[A] = F.Down[A];
		PendingPressed[A] = false;
	}
	if (F.IsDown(ELBAction::MoveForward)) F.MoveY += 1.f;
	if (F.IsDown(ELBAction::MoveBack)) F.MoveY -= 1.f;
	if (F.IsDown(ELBAction::MoveRight)) F.MoveX += 1.f;
	if (F.IsDown(ELBAction::MoveLeft)) F.MoveX -= 1.f;

	// Mouse: Unreal reports +Y when moving up; the camera expects +Y = down (like the browser).
	const float MouseScale = 0.0025f * 4.f * S.MouseSensitivity;
	F.LookX += MouseDX * MouseScale;
	F.LookY -= MouseDY * MouseScale;
	MouseDX = MouseDY = 0.f;
	const float KeyLook = 2.4f * Dt * S.MouseSensitivity;
	if (F.IsDown(ELBAction::LookLeft)) F.LookX -= KeyLook;
	if (F.IsDown(ELBAction::LookRight)) F.LookX += KeyLook;
	if (F.IsDown(ELBAction::LookUp)) F.LookY -= KeyLook * 0.6f;
	if (F.IsDown(ELBAction::LookDown)) F.LookY += KeyLook * 0.6f;

	const float LX = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_LeftX));
	const float LY = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_LeftY));
	const float RX = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_RightX));
	const float RY = Deadzone(GetInputAnalogKeyState(EKeys::Gamepad_RightY));
	if (LX != 0.f || LY != 0.f)
	{
		F.MoveX = LX;
		F.MoveY = LY;
	}
	const float Stick = 3.2f * Dt * S.StickSensitivity;
	F.LookX += RX * Stick;
	F.LookY -= RY * Stick * 0.6f;

	const float Len = FMath::Sqrt(F.MoveX * F.MoveX + F.MoveY * F.MoveY);
	if (Len > 1.f)
	{
		F.MoveX /= Len;
		F.MoveY /= Len;
	}
	if (S.bInvertY) F.LookY = -F.LookY;
	return F;
}

TArray<ELBNav> ALBPlayerController::TakeNav()
{
	TArray<ELBNav> Out = MoveTemp(NavQueue);
	NavQueue.Reset();
	return Out;
}

void ALBPlayerController::ClearAll()
{
	for (int32 A = 0; A < LBActionCount; A++)
	{
		PendingPressed[A] = false;
	}
	MouseDX = MouseDY = 0.f;
	NavQueue.Reset();
	// Treat currently held keys as already handled so they don't fire on release of a menu.
	for (TPair<FName, bool>& P : PrevKeyDown) P.Value = true;
}

FString ALBPlayerController::Prompt(ELBAction A) const
{
	const FLBSettings& S = Settings();
	if (!S.Bindings.IsValidIndex(int32(A))) return TEXT("-");
	const TArray<FString>& List = bGamepad ? S.Bindings[int32(A)].Pad : S.Bindings[int32(A)].Keys;
	return List.Num() > 0 ? LBInput::KeyName(List[0]) : FString(TEXT("-"));
}
