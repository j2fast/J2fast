#include "LBSettings.h"

namespace LBInput
{
	const TCHAR* ActionId(ELBAction A)
	{
		static const TCHAR* Ids[] = {TEXT("moveForward"), TEXT("moveBack"), TEXT("moveLeft"), TEXT("moveRight"), TEXT("lookLeft"), TEXT("lookRight"), TEXT("lookUp"), TEXT("lookDown"), TEXT("sprint"), TEXT("dodge"), TEXT("attack"), TEXT("heavy"), TEXT("ability"), TEXT("interact"), TEXT("heal"), TEXT("lockOn"), TEXT("targetNext"), TEXT("swapWeapon"), TEXT("questLog"), TEXT("inventory"), TEXT("pause")};
		return Ids[FMath::Clamp(int32(A), 0, LBActionCount - 1)];
	}

	FString ActionLabel(ELBAction A)
	{
		static const TCHAR* Labels[] = {TEXT("Move Forward"), TEXT("Move Back"), TEXT("Move Left"), TEXT("Move Right"), TEXT("Camera Left"), TEXT("Camera Right"), TEXT("Camera Up"), TEXT("Camera Down"), TEXT("Sprint"), TEXT("Dodge"), TEXT("Light Attack"), TEXT("Heavy Attack"), TEXT("Spirit Ability"), TEXT("Interact / Talk"), TEXT("Use Healing Item"), TEXT("Lock On"), TEXT("Switch Target"), TEXT("Swap Weapon"), TEXT("Quest Log"), TEXT("Inventory"), TEXT("Pause")};
		return Labels[FMath::Clamp(int32(A), 0, LBActionCount - 1)];
	}

	bool IsRequired(ELBAction A)
	{
		return A == ELBAction::MoveForward || A == ELBAction::MoveBack || A == ELBAction::MoveLeft || A == ELBAction::MoveRight || A == ELBAction::Attack || A == ELBAction::Dodge || A == ELBAction::Interact || A == ELBAction::Pause;
	}

	TArray<FLBBinding> DefaultBindings()
	{
		TArray<FLBBinding> B;
		B.SetNum(LBActionCount);
		auto Set = [&B](ELBAction A, TArray<FString> Keys, TArray<FString> Pad) {
			B[int32(A)].Keys = MoveTemp(Keys);
			B[int32(A)].Pad = MoveTemp(Pad);
		};
		Set(ELBAction::MoveForward, {TEXT("W")}, {});
		Set(ELBAction::MoveBack, {TEXT("S")}, {});
		Set(ELBAction::MoveLeft, {TEXT("A")}, {});
		Set(ELBAction::MoveRight, {TEXT("D")}, {});
		Set(ELBAction::LookLeft, {TEXT("Left")}, {});
		Set(ELBAction::LookRight, {TEXT("Right")}, {});
		Set(ELBAction::LookUp, {TEXT("Up")}, {});
		Set(ELBAction::LookDown, {TEXT("Down")}, {});
		Set(ELBAction::Sprint, {TEXT("LeftShift")}, {TEXT("Gamepad_LeftThumbstick")});
		Set(ELBAction::Dodge, {TEXT("SpaceBar")}, {TEXT("Gamepad_FaceButton_Right")});
		Set(ELBAction::Attack, {TEXT("LeftMouseButton"), TEXT("J")}, {TEXT("Gamepad_FaceButton_Left"), TEXT("Gamepad_RightShoulder")});
		Set(ELBAction::Heavy, {TEXT("RightMouseButton"), TEXT("K")}, {TEXT("Gamepad_FaceButton_Top"), TEXT("Gamepad_RightTrigger")});
		Set(ELBAction::Ability, {TEXT("Q")}, {TEXT("Gamepad_LeftTrigger")});
		Set(ELBAction::Interact, {TEXT("E")}, {TEXT("Gamepad_FaceButton_Bottom")});
		Set(ELBAction::Heal, {TEXT("F")}, {TEXT("Gamepad_DPad_Up")});
		Set(ELBAction::LockOn, {TEXT("MiddleMouseButton"), TEXT("Tab")}, {TEXT("Gamepad_RightThumbstick")});
		Set(ELBAction::TargetNext, {TEXT("MouseScrollDown"), TEXT("T")}, {TEXT("Gamepad_DPad_Right")});
		Set(ELBAction::SwapWeapon, {TEXT("R")}, {TEXT("Gamepad_LeftShoulder")});
		Set(ELBAction::QuestLog, {TEXT("L")}, {TEXT("Gamepad_Special_Left")});
		Set(ELBAction::Inventory, {TEXT("I")}, {TEXT("Gamepad_DPad_Down")});
		Set(ELBAction::Pause, {TEXT("Escape"), TEXT("P")}, {TEXT("Gamepad_Special_Right")});
		return B;
	}

	FString KeyName(const FString& Key)
	{
		static const TMap<FString, FString> Names = {
			{TEXT("LeftMouseButton"), TEXT("LMB")},
			{TEXT("RightMouseButton"), TEXT("RMB")},
			{TEXT("MiddleMouseButton"), TEXT("MMB")},
			{TEXT("ThumbMouseButton"), TEXT("Mouse4")},
			{TEXT("ThumbMouseButton2"), TEXT("Mouse5")},
			{TEXT("MouseScrollUp"), TEXT("Wheel Up")},
			{TEXT("MouseScrollDown"), TEXT("Wheel Down")},
			{TEXT("SpaceBar"), TEXT("Space")},
			{TEXT("LeftShift"), TEXT("L-Shift")},
			{TEXT("RightShift"), TEXT("R-Shift")},
			{TEXT("LeftControl"), TEXT("L-Ctrl")},
			{TEXT("RightControl"), TEXT("R-Ctrl")},
			{TEXT("LeftAlt"), TEXT("L-Alt")},
			{TEXT("RightAlt"), TEXT("R-Alt")},
			{TEXT("Escape"), TEXT("Esc")},
			{TEXT("Left"), TEXT("Left Arrow")},
			{TEXT("Right"), TEXT("Right Arrow")},
			{TEXT("Up"), TEXT("Up Arrow")},
			{TEXT("Down"), TEXT("Down Arrow")},
			{TEXT("Gamepad_FaceButton_Bottom"), TEXT("A")},
			{TEXT("Gamepad_FaceButton_Right"), TEXT("B")},
			{TEXT("Gamepad_FaceButton_Left"), TEXT("X")},
			{TEXT("Gamepad_FaceButton_Top"), TEXT("Y")},
			{TEXT("Gamepad_LeftShoulder"), TEXT("LB")},
			{TEXT("Gamepad_RightShoulder"), TEXT("RB")},
			{TEXT("Gamepad_LeftTrigger"), TEXT("LT")},
			{TEXT("Gamepad_RightTrigger"), TEXT("RT")},
			{TEXT("Gamepad_Special_Left"), TEXT("Back")},
			{TEXT("Gamepad_Special_Right"), TEXT("Start")},
			{TEXT("Gamepad_LeftThumbstick"), TEXT("L3")},
			{TEXT("Gamepad_RightThumbstick"), TEXT("R3")},
			{TEXT("Gamepad_DPad_Up"), TEXT("D-Up")},
			{TEXT("Gamepad_DPad_Down"), TEXT("D-Down")},
			{TEXT("Gamepad_DPad_Left"), TEXT("D-Left")},
			{TEXT("Gamepad_DPad_Right"), TEXT("D-Right")},
		};
		if (const FString* N = Names.Find(Key)) return *N;
		return Key;
	}

	TArray<ELBAction> Rebind(TArray<FLBBinding>& Bindings, ELBAction Action, const FString& Key, bool bPad)
	{
		TArray<ELBAction> Displaced;
		for (int32 I = 0; I < Bindings.Num(); I++)
		{
			if (I == int32(Action)) continue;
			TArray<FString>& List = bPad ? Bindings[I].Pad : Bindings[I].Keys;
			if (List.Remove(Key) > 0) Displaced.Add(ELBAction(I));
		}
		if (!Bindings.IsValidIndex(int32(Action))) return Displaced;
		TArray<FString>& Own = bPad ? Bindings[int32(Action)].Pad : Bindings[int32(Action)].Keys;
		Own.Remove(Key);
		Own.Insert(Key, 0);
		if (Own.Num() > 2) Own.SetNum(2);
		return Displaced;
	}
}

namespace LBSettingsUtil
{
	FLBSettings Defaults()
	{
		FLBSettings S;
		S.Bindings = LBInput::DefaultBindings();
		return S;
	}

	void Sanitize(FLBSettings& S)
	{
		auto Clamp01 = [](float& V) { V = FMath::IsFinite(V) ? FMath::Clamp(V, 0.f, 1.f) : 0.8f; };
		Clamp01(S.MasterVolume);
		Clamp01(S.MusicVolume);
		Clamp01(S.SfxVolume);
		Clamp01(S.SubtitleBackground);
		S.MouseSensitivity = FMath::Clamp(FMath::IsFinite(S.MouseSensitivity) ? S.MouseSensitivity : 1.f, 0.1f, 3.f);
		S.StickSensitivity = FMath::Clamp(FMath::IsFinite(S.StickSensitivity) ? S.StickSensitivity : 1.f, 0.1f, 3.f);
		S.Fov = FMath::Clamp(FMath::IsFinite(S.Fov) ? S.Fov : 70.f, 55.f, 100.f);
		S.Brightness = FMath::Clamp(FMath::IsFinite(S.Brightness) ? S.Brightness : 0.f, -2.f, 2.f);
		S.SubtitleSize = FMath::Clamp(S.SubtitleSize, 0, 3);
		S.Difficulty = FMath::Clamp(S.Difficulty, 0, 2);
		S.Quality = FMath::Clamp(S.Quality, 0, 3);
		const TArray<FLBBinding> Def = LBInput::DefaultBindings();
		if (S.Bindings.Num() != LBActionCount) S.Bindings = Def;
		for (int32 I = 0; I < LBActionCount; I++)
		{
			FLBBinding& B = S.Bindings[I];
			B.Keys.RemoveAll([](const FString& K) { return K.IsEmpty() || K.Len() > 40; });
			B.Pad.RemoveAll([](const FString& K) { return K.IsEmpty() || K.Len() > 40; });
			if (B.Keys.Num() > 2) B.Keys.SetNum(2);
			if (B.Pad.Num() > 2) B.Pad.SetNum(2);
			if (LBInput::IsRequired(ELBAction(I)) && B.Keys.Num() == 0) B.Keys = Def[I].Keys;
		}
	}

	float EnemyDamageMult(const FLBSettings& S)
	{
		return S.Difficulty == 0 ? 0.5f : S.Difficulty == 2 ? 1.5f : 1.f;
	}

	float EnemyHealthMult(const FLBSettings& S)
	{
		return S.Difficulty == 0 ? 0.7f : S.Difficulty == 2 ? 1.3f : 1.f;
	}

	FString DifficultyName(int32 D)
	{
		return D == 0 ? TEXT("Story") : D == 2 ? TEXT("Hard") : TEXT("Normal");
	}
}
