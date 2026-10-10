#include "LBAudio.h"
#include "Lanternbound.h"
#include "Sound/SoundWaveProcedural.h"
#include "Components/AudioComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

namespace
{
	constexpr int32 SR = 32000;

	enum class EWave : uint8 { Sine, Square, Saw, Triangle };
	enum class EFilter : uint8 { None, Lowpass, Highpass, Bandpass };

	/** WebAudio-style exponential ramp from A (at 0) to B (at 1). */
	float ExpRamp(float A, float B, float T)
	{
		T = FMath::Clamp(T, 0.f, 1.f);
		A = FMath::Max(A, 1e-6f);
		B = FMath::Max(B, 1e-6f);
		return A * FMath::Pow(B / A, T);
	}

	float WaveAt(EWave W, double Phase)
	{
		const double P = Phase - FMath::FloorToDouble(Phase);
		switch (W)
		{
		case EWave::Square: return P < 0.5 ? 1.f : -1.f;
		case EWave::Saw: return float(2.0 * P - 1.0);
		case EWave::Triangle: return float(4.0 * FMath::Abs(P - 0.5) - 1.0);
		default: return FMath::Sin(float(2.0 * UE_PI * P));
		}
	}

	/** RBJ biquad with per-block coefficient updates (supports swept cutoff). */
	struct FBiquad
	{
		float B0 = 1, B1 = 0, B2 = 0, A1 = 0, A2 = 0;
		float X1 = 0, X2 = 0, Y1 = 0, Y2 = 0;
		void Set(EFilter Type, float Freq, float Q)
		{
			Freq = FMath::Clamp(Freq, 20.f, SR * 0.45f);
			Q = FMath::Max(0.3f, Q);
			const float W0 = 2.f * UE_PI * Freq / SR;
			const float CosW = FMath::Cos(W0);
			const float Alpha = FMath::Sin(W0) / (2.f * Q);
			float b0, b1, b2;
			const float a0 = 1.f + Alpha;
			switch (Type)
			{
			case EFilter::Highpass:
				b0 = (1.f + CosW) / 2.f;
				b1 = -(1.f + CosW);
				b2 = (1.f + CosW) / 2.f;
				break;
			case EFilter::Bandpass:
				b0 = Alpha;
				b1 = 0.f;
				b2 = -Alpha;
				break;
			default:
				b0 = (1.f - CosW) / 2.f;
				b1 = 1.f - CosW;
				b2 = (1.f - CosW) / 2.f;
				break;
			}
			B0 = b0 / a0;
			B1 = b1 / a0;
			B2 = b2 / a0;
			A1 = -2.f * CosW / a0;
			A2 = (1.f - Alpha) / a0;
		}
		float Process(float X)
		{
			const float Y = B0 * X + B1 * X1 + B2 * X2 - A1 * Y1 - A2 * Y2;
			X2 = X1;
			X1 = X;
			Y2 = Y1;
			Y1 = Y;
			return Y;
		}
	};

	/** Gain envelope: 0.0001 -> Peak (exp, Attack) -> Sustain (exp, Decay), then holds. */
	float Env(float T, float Attack, float Peak, float Decay, float Sustain = 0.0001f)
	{
		if (T < 0.f) return 0.f;
		if (T < Attack) return ExpRamp(0.0001f, Peak, T / FMath::Max(1e-4f, Attack));
		if (T < Attack + Decay) return ExpRamp(Peak, Sustain, (T - Attack) / FMath::Max(1e-4f, Decay));
		return Sustain;
	}

	struct FMix
	{
		TArray<float> Buf;
		bool bWrap = false; // music loops wrap note tails to the start
		void Add(int32 Index, float V)
		{
			if (Buf.Num() == 0) return;
			if (bWrap) Index = ((Index % Buf.Num()) + Buf.Num()) % Buf.Num();
			else if (Index < 0 || Index >= Buf.Num()) return;
			Buf[Index] += V;
		}
	};

	FRandomStream NoiseRng(4711);

	/** Oscillator with optional exponential pitch sweep and the standard sfx envelope. */
	void Osc(FMix& M, EWave W, float Freq, float T0, float Dur, float Gain, float FreqEnd = -1.f, float Attack = 0.005f)
	{
		const int32 Start = FMath::RoundToInt(T0 * SR);
		const int32 Len = FMath::RoundToInt((Dur + 0.05f) * SR);
		double Phase = 0.0;
		for (int32 I = 0; I < Len; I++)
		{
			const float T = float(I) / SR;
			const float F = FreqEnd > 0.f ? ExpRamp(Freq, FreqEnd, T / Dur) : Freq;
			Phase += F / SR;
			const float G = Env(T, Attack, Gain, FMath::Max(0.001f, Dur - Attack));
			M.Add(Start + I, WaveAt(W, Phase) * G);
		}
	}

	void Noise(FMix& M, float T0, float Dur, float Gain, EFilter Type, float Freq, float FreqEnd = -1.f, float Q = 1.f, float Attack = 0.003f)
	{
		const int32 Start = FMath::RoundToInt(T0 * SR);
		const int32 Len = FMath::RoundToInt((Dur + 0.05f) * SR);
		FBiquad F;
		for (int32 I = 0; I < Len; I++)
		{
			const float T = float(I) / SR;
			if (I % 32 == 0) F.Set(Type, FreqEnd > 0.f ? ExpRamp(Freq, FreqEnd, T / Dur) : Freq, Q);
			const float X = NoiseRng.FRand() * 2.f - 1.f;
			const float G = Env(T, Attack, Gain, FMath::Max(0.001f, Dur - Attack));
			M.Add(Start + I, F.Process(X) * G);
		}
	}

	TArray<int16> ToPcm(const TArray<float>& In, float Gain)
	{
		TArray<int16> Out;
		Out.SetNumUninitialized(In.Num());
		for (int32 I = 0; I < In.Num(); I++)
		{
			// Gentle soft clip in place of the web build's compressor.
			const float V = FMath::Clamp(FMath::Tanh(In[I] * Gain), -1.f, 1.f);
			Out[I] = int16(V * 32000.f);
		}
		return Out;
	}

	// ------------------------------------------------------------------ Sound effects

	void Synth(const FString& Name, FMix& M, float P)
	{
		const float t = 0.f;
		auto Arp = [&](std::initializer_list<int32> Semis, float Base, float Step, float Dur, float Gain, EWave W) {
			int32 I = 0;
			for (const int32 S : Semis) Osc(M, W, Base * FMath::Pow(2.f, S / 12.f), t + I++ * Step, Dur, Gain);
		};
		if (Name == TEXT("swing")) Noise(M, t, 0.16f, 0.35f, EFilter::Bandpass, 900 * P, 3200 * P, 1.2f, 0.03f);
		else if (Name == TEXT("swingHeavy")) Noise(M, t, 0.3f, 0.45f, EFilter::Bandpass, 400 * P, 1600 * P, 1.f, 0.06f);
		else if (Name == TEXT("hit"))
		{
			Noise(M, t, 0.09f, 0.6f, EFilter::Lowpass, 3000 * P, 600, 1.f);
			Osc(M, EWave::Square, 220 * P, t, 0.08f, 0.15f, 90);
		}
		else if (Name == TEXT("hitHeavy"))
		{
			Noise(M, t, 0.18f, 0.8f, EFilter::Lowpass, 1800 * P, 200, 1.f);
			Osc(M, EWave::Sine, 120 * P, t, 0.25f, 0.6f, 40);
		}
		else if (Name == TEXT("crit"))
		{
			Noise(M, t, 0.12f, 0.6f, EFilter::Highpass, 2500, 1500, 1.f);
			Osc(M, EWave::Triangle, 1200 * P, t, 0.25f, 0.25f, 1800);
			Osc(M, EWave::Sine, 140 * P, t, 0.2f, 0.5f, 50);
		}
		else if (Name == TEXT("playerHurt"))
		{
			Osc(M, EWave::Saw, 260 * P, t, 0.22f, 0.2f, 110);
			Noise(M, t, 0.15f, 0.5f, EFilter::Lowpass, 1500, 300, 1.f);
		}
		else if (Name == TEXT("dodge")) Noise(M, t, 0.25f, 0.3f, EFilter::Bandpass, 500 * P, 1400 * P, 0.8f, 0.05f);
		else if (Name == TEXT("enemyWindup")) Osc(M, EWave::Saw, 180 * P, t, 0.35f, 0.12f, 260 * P, 0.1f);
		else if (Name == TEXT("enemyDie"))
		{
			Noise(M, t, 0.6f, 0.35f, EFilter::Bandpass, 1200 * P, 200, 1.5f, 0.02f);
			Osc(M, EWave::Sine, 500 * P, t, 0.5f, 0.15f, 120);
		}
		else if (Name == TEXT("bossRoar"))
		{
			Osc(M, EWave::Saw, 90 * P, t, 1.4f, 0.4f, 55, 0.15f);
			Osc(M, EWave::Saw, 93 * P, t, 1.4f, 0.3f, 50, 0.15f);
			Noise(M, t, 1.3f, 0.4f, EFilter::Lowpass, 700, 200, 1.f, 0.15f);
		}
		else if (Name == TEXT("arrow"))
		{
			Noise(M, t, 0.12f, 0.3f, EFilter::Highpass, 3000, 6000, 1.f, 0.005f);
			Osc(M, EWave::Triangle, 900 * P, t, 0.08f, 0.1f, 400);
		}
		else if (Name == TEXT("orb"))
		{
			Osc(M, EWave::Sine, 600 * P, t, 0.3f, 0.15f, 300);
			Noise(M, t, 0.25f, 0.15f, EFilter::Bandpass, 2000, 800, 2.f);
		}
		else if (Name == TEXT("explosion"))
		{
			Noise(M, t, 0.7f, 0.9f, EFilter::Lowpass, 1200, 80, 1.f);
			Osc(M, EWave::Sine, 80 * P, t, 0.6f, 0.7f, 30);
		}
		else if (Name == TEXT("pickup"))
		{
			Osc(M, EWave::Sine, 880 * P, t, 0.12f, 0.2f);
			Osc(M, EWave::Sine, 1320 * P, t + 0.06f, 0.15f, 0.2f);
		}
		else if (Name == TEXT("coin"))
		{
			Osc(M, EWave::Square, 1600 * P, t, 0.06f, 0.06f);
			Osc(M, EWave::Square, 2100 * P, t + 0.05f, 0.1f, 0.06f);
		}
		else if (Name == TEXT("levelUp")) Arp({0, 4, 7, 12}, 523.f, 0.09f, 0.5f, 0.25f, EWave::Triangle);
		else if (Name == TEXT("questUpdate"))
		{
			Osc(M, EWave::Sine, 660, t, 0.25f, 0.25f);
			Osc(M, EWave::Sine, 990, t + 0.1f, 0.35f, 0.2f);
		}
		else if (Name == TEXT("questComplete"))
		{
			Arp({0, 5, 7, 12}, 392.f, 0.12f, 0.8f, 0.22f, EWave::Triangle);
			Osc(M, EWave::Sine, 196, t, 1.2f, 0.25f);
		}
		else if (Name == TEXT("uiMove")) Osc(M, EWave::Sine, 1200, t, 0.04f, 0.08f);
		else if (Name == TEXT("uiConfirm"))
		{
			Osc(M, EWave::Triangle, 900, t, 0.08f, 0.15f);
			Osc(M, EWave::Triangle, 1350, t + 0.05f, 0.1f, 0.12f);
		}
		else if (Name == TEXT("uiBack")) Osc(M, EWave::Triangle, 700, t, 0.08f, 0.12f, 500);
		else if (Name == TEXT("uiError")) Osc(M, EWave::Square, 200, t, 0.15f, 0.08f);
		else if (Name == TEXT("heal")) Arp({0, 3, 7}, 660.f, 0.07f, 0.4f, 0.18f, EWave::Sine);
		else if (Name == TEXT("ability"))
		{
			Noise(M, t, 0.4f, 0.4f, EFilter::Bandpass, 600, 3000, 2.f, 0.05f);
			Osc(M, EWave::Triangle, 440 * P, t, 0.35f, 0.2f, 880);
		}
		else if (Name == TEXT("swap"))
		{
			Osc(M, EWave::Square, 500, t, 0.05f, 0.08f);
			Noise(M, t, 0.08f, 0.2f, EFilter::Highpass, 4000, 3000, 1.f);
		}
		else if (Name == TEXT("chest"))
		{
			Osc(M, EWave::Triangle, 300, t, 0.2f, 0.2f, 200);
			int32 I = 0;
			for (const int32 S : {0, 4, 7, 11}) Osc(M, EWave::Sine, 784.f * FMath::Pow(2.f, S / 12.f), t + 0.15f + I++ * 0.06f, 0.4f, 0.15f);
		}
		else if (Name == TEXT("brazier"))
		{
			Noise(M, t, 0.8f, 0.5f, EFilter::Lowpass, 400, 2500, 1.f, 0.1f);
			Osc(M, EWave::Sine, 330, t, 1.f, 0.2f, 660, 0.2f);
		}
		else if (Name == TEXT("door"))
		{
			Noise(M, t, 1.6f, 0.5f, EFilter::Lowpass, 300, 120, 2.f, 0.2f);
			Osc(M, EWave::Saw, 50, t, 1.5f, 0.2f, 40, 0.2f);
		}
		else if (Name == TEXT("death"))
		{
			Osc(M, EWave::Sine, 220, t, 2.f, 0.3f, 55, 0.05f);
			Osc(M, EWave::Sine, 233, t, 2.f, 0.2f, 58, 0.05f);
		}
		else if (Name == TEXT("parry"))
		{
			Osc(M, EWave::Sine, 1800, t, 0.6f, 0.25f, 900);
			Osc(M, EWave::Sine, 2700, t, 0.4f, 0.15f, 1300);
		}
		else if (Name == TEXT("splash")) Noise(M, t, 0.2f, 0.2f, EFilter::Bandpass, 1200, 500, 1.5f, 0.01f);
		else if (Name == TEXT("lockOn"))
		{
			Osc(M, EWave::Sine, 1000, t, 0.06f, 0.1f);
			Osc(M, EWave::Sine, 1500, t + 0.04f, 0.06f, 0.08f);
		}
		else if (Name == TEXT("step")) Noise(M, t, 0.05f, 0.08f, EFilter::Lowpass, 600, 300, 1.f);
		else if (Name == TEXT("block"))
		{
			Osc(M, EWave::Square, 300, t, 0.08f, 0.12f, 200);
			Noise(M, t, 0.08f, 0.3f, EFilter::Highpass, 2000, 1500, 1.f);
		}
		else if (Name == TEXT("stagger"))
		{
			Osc(M, EWave::Triangle, 300, t, 0.4f, 0.3f, 120);
			Noise(M, t, 0.3f, 0.4f, EFilter::Lowpass, 1000, 200, 1.f);
		}
	}

	const TCHAR* SfxNames[] = {TEXT("swing"), TEXT("swingHeavy"), TEXT("hit"), TEXT("hitHeavy"), TEXT("crit"), TEXT("playerHurt"), TEXT("dodge"), TEXT("enemyWindup"), TEXT("enemyDie"), TEXT("bossRoar"), TEXT("arrow"), TEXT("orb"), TEXT("explosion"), TEXT("pickup"), TEXT("coin"), TEXT("levelUp"), TEXT("questUpdate"), TEXT("questComplete"), TEXT("uiMove"), TEXT("uiConfirm"), TEXT("uiBack"), TEXT("uiError"), TEXT("heal"), TEXT("ability"), TEXT("swap"), TEXT("chest"), TEXT("brazier"), TEXT("door"), TEXT("death"), TEXT("parry"), TEXT("splash"), TEXT("lockOn"), TEXT("step"), TEXT("block"), TEXT("stagger")};

	FString CaptionFor(const FString& Name)
	{
		if (Name == TEXT("bossRoar")) return TEXT("[A deafening roar]");
		if (Name == TEXT("levelUp")) return TEXT("[Bright chime: level up]");
		if (Name == TEXT("door")) return TEXT("[Stone doors grind open]");
		if (Name == TEXT("questComplete")) return TEXT("[Triumphant chord]");
		if (Name == TEXT("death")) return TEXT("[Low, fading drone]");
		if (Name == TEXT("brazier")) return TEXT("[Spirit flame ignites]");
		if (Name == TEXT("explosion")) return TEXT("[Explosion]");
		if (Name == TEXT("parry")) return TEXT("[Time slows]");
		if (Name == TEXT("stagger")) return TEXT("[Enemy staggers]");
		return FString();
	}

	// ------------------------------------------------------------------ Music

	struct FLayerDef
	{
		const TCHAR* Inst;
		float Gain;
		int32 Octave;
		bool bCombat;
		const TCHAR* Pattern;
	};
	struct FTrackDef
	{
		const TCHAR* Name;
		float Bpm;
		int32 Root;
		bool bYo;
		TArray<FLayerDef> Layers;
	};

	const TArray<FTrackDef>& TrackDefs()
	{
		static const TArray<FTrackDef> Defs = {
			{TEXT("title"), 66, 62, false, {
				{TEXT("pad"), 0.5f, -1, false, TEXT("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _")},
				{TEXT("koto"), 0.5f, 0, false, TEXT("0 . 2 . 4 . 5 . 4 . 2 . 3 . . . | -1 . 1 . 3 . 4 . 3 . 1 . 2 . . . | 1 . 3 . 5 . 6 . 5 . 3 . 4 . 2 . | -2 . 0 . 2 . 3 . 2 . 0 . -1 . . .")},
				{TEXT("flute"), 0.35f, 0, false, TEXT(". . . . . . . . 7 _ _ _ 6 _ 5 _ | 4 _ _ _ _ _ _ _ . . . . . . . . | . . . . . . . . 8 _ _ _ 7 _ 6 _ | 5 _ _ _ 4 _ _ _ _ _ _ _ . . . .")},
				{TEXT("bell"), 0.25f, 1, false, TEXT("0 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | 2 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .")},
			}},
			{TEXT("village"), 84, 64, true, {
				{TEXT("pad"), 0.32f, -1, false, TEXT("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 2 _ _ _ _ _ _ _ 4 _ _ _ _ _ _ _")},
				{TEXT("koto"), 0.45f, 0, false, TEXT("0 . 1 2 . 4 . 2 3 . 2 1 0 . . . | 3 . 4 5 . 4 . 3 2 . 1 . 2 . . . | 1 . 2 3 . 5 . 3 4 . 3 2 1 . 0 . | 2 . 1 . 0 . -1 . 0 . . . . . . .")},
				{TEXT("flute"), 0.3f, 0, false, TEXT(". . . . . . . . . . . . 5 _ 6 _ | 7 _ _ _ 6 _ 5 _ 4 _ _ _ . . . . | . . . . . . . . . . . . 6 _ 7 _ | 8 _ _ _ 7 _ 5 _ 5 _ _ _ _ _ . .")},
				{TEXT("bass"), 0.35f, -2, false, TEXT("0 . . . 0 . . . 2 . . . 0 . . . | 3 . . . 3 . . . 1 . . . 3 . . . | 1 . . . 1 . . . 3 . . . 1 . . . | 2 . . . 2 . . . 4 . . . -1 . . .")},
				{TEXT("shaker"), 0.15f, 0, false, TEXT(". . x . . . x . . . x . . . x x | . . x . . . x . . . x . . . x . | . . x . . . x . . . x . . . x x | . . x . . . x . . . x . x . x .")},
			}},
			{TEXT("field"), 104, 62, false, {
				{TEXT("shamisen"), 0.32f, 0, false, TEXT("0 . 0 2 . 0 3 . 0 . 0 2 . 3 2 . | 0 . 0 2 . 0 3 . 4 . 3 2 . 1 0 . | -1 . -1 1 . -1 2 . -1 . -1 1 . 2 1 . | 0 . 0 2 . 0 3 . 2 . 1 0 . -1 -2 .")},
				{TEXT("koto"), 0.38f, 0, false, TEXT("5 _ _ _ 4 _ 3 _ 4 _ _ _ . . . . | 5 _ 6 _ 7 _ 6 _ 5 _ _ _ . . . . | 4 _ _ _ 3 _ 2 _ 3 _ _ _ . . . . | 2 _ 3 _ 4 _ 3 _ 0 _ _ _ . . . .")},
				{TEXT("bass"), 0.35f, -2, false, TEXT("0 . . . . . 0 . . . 0 . . . . . | 0 . . . . . 0 . . . 2 . . . . . | -1 . . . . . -1 . . . -1 . . . . . | 0 . . . . . 0 . . . -2 . . . . .")},
				{TEXT("taiko"), 0.6f, 0, true, TEXT("x . . x . . x . x . . . x . x . | x . . x . . x . x . . . x x x x")},
				{TEXT("ka"), 0.25f, 0, true, TEXT(". . x . . x . . . . x . . . . x")},
				{TEXT("shaker"), 0.12f, 0, false, TEXT("x . x . x . x . x . x . x . x x")},
			}},
			{TEXT("marsh"), 76, 61, false, {
				{TEXT("pad"), 0.45f, -1, false, TEXT("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 0 _ _ _ _ _ _ _ -2 _ _ _ _ _ _ _")},
				{TEXT("flute"), 0.35f, 0, false, TEXT(". . . . 4 _ _ _ _ _ 3 _ 2 _ _ _ | . . . . . . . . 1 _ 2 _ 3 _ _ _ | . . . . 5 _ _ _ _ _ 4 _ 3 _ 2 _ | 1 _ _ _ _ _ _ _ 0 _ _ _ _ _ . .")},
				{TEXT("koto"), 0.3f, 0, false, TEXT("0 . . . . . . 2 . . . . . . . . | . . 1 . . . . . . . 3 . . . . . | 0 . . . . . . 2 . . . . 4 . . . | . . 1 . . . . . 0 . . . . . . .")},
				{TEXT("taiko"), 0.5f, 0, true, TEXT("x . . . . . x . x . . . . . . . | x . . . . . x . x . . . x . x .")},
				{TEXT("bell"), 0.18f, 1, false, TEXT(". . . . . . . . . . . . . . . . | 4 . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | 2 . . . . . . . . . . . . . . .")},
			}},
			{TEXT("dungeon"), 66, 57, false, {
				{TEXT("pad"), 0.5f, -1, false, TEXT("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 0 _ _ _ _ _ _ _ 1 _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ -1 _ _ _ _ _ _ _")},
				{TEXT("taiko"), 0.45f, 0, false, TEXT("x . . . . . . . x . . . . . . .")},
				{TEXT("bell"), 0.22f, 1, false, TEXT(". . . . . . . . 1 . . . . . . . | . . . . . . . . . . . . . . . . | . . . . . . . . 0 . . . . . . . | . . . . . . . . . . . . 3 . . .")},
				{TEXT("flute"), 0.25f, 0, false, TEXT(". . . . . . . . . . . . . . . . | 3 _ _ _ _ _ 2 _ 1 _ _ _ _ _ _ _ | . . . . . . . . . . . . . . . . | 1 _ _ _ 0 _ _ _ -1 _ _ _ _ _ _ _")},
				{TEXT("ka"), 0.2f, 0, true, TEXT(". . x . . . x . . . x . . x . x")},
				{TEXT("shamisen"), 0.25f, 0, true, TEXT("0 . 0 . 1 . 0 . -1 . 0 . 1 . 2 .")},
			}},
			{TEXT("boss"), 140, 62, false, {
				{TEXT("taiko"), 0.75f, 0, false, TEXT("x . . x . . x . x . x . x . . . | x . . x . . x . x x . x x . x x")},
				{TEXT("ka"), 0.3f, 0, false, TEXT(". . x . x . . x . . x . . x x .")},
				{TEXT("shamisen"), 0.38f, 0, false, TEXT("0 0 2 0 3 0 2 0 4 3 2 0 1 0 -1 0 | 0 0 2 0 3 0 5 4 3 2 1 0 -1 -2 -1 0")},
				{TEXT("bass"), 0.45f, -2, false, TEXT("0 . 0 . 0 . 0 . 1 . 1 . -1 . -1 . | 0 . 0 . 0 . 0 . 2 . 1 . 0 . -1 .")},
				{TEXT("flute"), 0.3f, 0, false, TEXT("7 _ _ _ _ _ 6 _ 5 _ _ _ 6 _ _ _ | 7 _ 8 _ 9 _ _ _ 8 _ 7 _ 6 _ 5 _")},
			}},
			{TEXT("finalBoss"), 150, 61, false, {
				{TEXT("taiko"), 0.8f, 0, false, TEXT("x . x x . x . x x . x . x x x x")},
				{TEXT("ka"), 0.3f, 0, false, TEXT(". x . . x . x . . x . x . . x .")},
				{TEXT("pad"), 0.4f, -1, false, TEXT("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ -1 _ _ _ _ _ _ _")},
				{TEXT("shamisen"), 0.38f, 0, false, TEXT("0 2 3 2 0 2 3 4 5 4 3 2 3 2 0 -1 | 0 2 3 2 0 2 3 4 6 5 4 3 2 1 0 -1")},
				{TEXT("flute"), 0.35f, 0, false, TEXT("9 _ _ _ 8 _ 7 _ 8 _ _ _ _ _ 5 _ | 6 _ 7 _ 8 _ 9 _ 10 _ _ _ 9 _ _ _ | 8 _ _ _ 7 _ 6 _ 7 _ _ _ _ _ 5 _ | 4 _ 5 _ 6 _ 5 _ 4 _ _ _ _ _ _ _")},
				{TEXT("bass"), 0.45f, -2, false, TEXT("0 . 0 0 . 0 . 0 -1 . -1 -1 . -1 . -1 | 1 . 1 1 . 1 . 1 -2 . -2 -2 . -1 . -1")},
			}},
			{TEXT("summit"), 88, 61, false, {
				{TEXT("pad"), 0.42f, -1, false, TEXT("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | -1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 1 _ _ _ _ _ _ _ 0 _ _ _ _ _ _ _")},
				{TEXT("flute"), 0.35f, 0, false, TEXT("5 _ _ _ 4 _ 5 _ 7 _ _ _ 6 _ 5 _ | 4 _ _ _ _ _ 3 _ 2 _ _ _ _ _ . . | 5 _ _ _ 6 _ 7 _ 8 _ _ _ 7 _ 6 _ | 5 _ 4 _ 3 _ _ _ 2 _ _ _ _ _ . .")},
				{TEXT("koto"), 0.32f, 0, false, TEXT("0 . 2 . 3 . 2 . 0 . 2 . 3 . 4 . | -2 . 0 . 1 . 0 . -2 . 0 . 1 . 2 . | -1 . 1 . 2 . 1 . -1 . 1 . 2 . 3 . | 1 . 3 . 4 . 3 . 0 . 2 . 3 . 2 .")},
				{TEXT("taiko"), 0.55f, 0, true, TEXT("x . . . x . . x x . . . x . x .")},
				{TEXT("ka"), 0.2f, 0, true, TEXT(". . x . . . x . . . x . . . x x")},
			}},
			{TEXT("ending"), 72, 64, true, {
				{TEXT("pad"), 0.4f, -1, false, TEXT("0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ | 0 _ _ _ _ _ _ _ 2 _ _ _ _ _ _ _")},
				{TEXT("koto"), 0.42f, 0, false, TEXT("0 . 2 . 4 . 5 . 7 . 5 . 4 . 2 . | 3 . 5 . 7 . 8 . 7 . 5 . 3 . 2 . | 4 . 6 . 7 . 9 . 7 . 6 . 4 . 3 . | 5 . 4 . 2 . 1 . 0 . . . . . . .")},
				{TEXT("flute"), 0.35f, 0, false, TEXT("7 _ _ _ _ _ 6 _ 5 _ _ _ 4 _ _ _ | 5 _ _ _ 7 _ _ _ 8 _ _ _ _ _ _ _ | 9 _ _ _ 8 _ 7 _ 6 _ _ _ 7 _ _ _ | 5 _ _ _ _ _ _ _ _ _ _ _ . . . .")},
				{TEXT("bell"), 0.22f, 1, false, TEXT("0 . . . . . . . . . . . . . . . | . . . . . . . . 2 . . . . . . . | 4 . . . . . . . . . . . . . . . | . . . . . . . . 0 . . . . . . .")},
			}},
		};
		return Defs;
	}

	struct FStep
	{
		int32 Deg = 0;
		int32 Len = 1;
		bool bHit = false;
	};

	TArray<FStep> Parse(const FString& Pattern)
	{
		TArray<FString> Tokens;
		Pattern.Replace(TEXT("|"), TEXT(" ")).ParseIntoArrayWS(Tokens);
		TArray<FStep> Steps;
		Steps.SetNum(Tokens.Num());
		int32 Last = -1;
		for (int32 I = 0; I < Tokens.Num(); I++)
		{
			const FString& T = Tokens[I];
			if (T == TEXT("_"))
			{
				if (Last >= 0) Steps[Last].Len++;
			}
			else if (T == TEXT("."))
			{
				Last = -1;
			}
			else if (T == TEXT("x"))
			{
				Steps[I].bHit = true;
				Last = -1;
			}
			else if (T.IsNumeric())
			{
				Steps[I].Deg = FCString::Atoi(*T);
				Steps[I].bHit = true;
				Last = I;
			}
		}
		return Steps;
	}

	float MidiToFreq(int32 Midi) { return 440.f * FMath::Pow(2.f, (Midi - 69) / 12.f); }

	/** Renders one note of an instrument into a temporary buffer (seconds from note start). */
	void RenderNote(const FString& Inst, float F, float Dur, TArray<float>& Out)
	{
		auto Len = [](float Seconds) { return FMath::Max(1, FMath::RoundToInt(Seconds * SR)); };
		if (Inst == TEXT("koto"))
		{
			Out.SetNumZeroed(Len(1.5f));
			double P1 = 0, P2 = 0;
			FBiquad LP;
			for (int32 I = 0; I < Out.Num(); I++)
			{
				const float T = float(I) / SR;
				P1 += ExpRamp(F * 1.01f, F, T / 0.05f) / SR;
				P2 += F * 2.f / SR;
				if (I % 32 == 0) LP.Set(EFilter::Lowpass, ExpRamp(4000.f, 900.f, T / 0.6f), 0.707f);
				float V = WaveAt(EWave::Triangle, P1) * Env(T, 0.004f, 0.35f, 1.3f);
				if (T < 0.6f) V += WaveAt(EWave::Sine, P2) * Env(T, 0.004f, 0.08f, 0.4f);
				Out[I] = LP.Process(V);
			}
		}
		else if (Inst == TEXT("shamisen"))
		{
			Out.SetNumZeroed(Len(0.35f));
			double P = 0;
			FBiquad BP;
			BP.Set(EFilter::Bandpass, FMath::Min(4000.f, F * 3.f), 2.f);
			for (int32 I = 0; I < Out.Num(); I++)
			{
				const float T = float(I) / SR;
				P += F / SR;
				Out[I] = BP.Process(WaveAt(EWave::Saw, P)) * Env(T, 0.002f, 0.3f, 0.25f);
			}
		}
		else if (Inst == TEXT("flute"))
		{
			const float D = FMath::Max(0.15f, Dur);
			Out.SetNumZeroed(Len(D + 0.3f));
			double P = 0;
			FBiquad BP;
			BP.Set(EFilter::Bandpass, F * 2.f, 3.f);
			for (int32 I = 0; I < Out.Num(); I++)
			{
				const float T = float(I) / SR;
				const float Depth = F * 0.012f * FMath::Clamp(T / FMath::Min(Dur, 0.4f), 0.f, 1.f);
				P += (F + FMath::Sin(2.f * UE_PI * 5.2f * T) * Depth) / SR;
				float G;
				if (T < 0.09f) G = ExpRamp(0.0001f, 0.22f, T / 0.09f);
				else if (T < D * 0.8f) G = 0.22f;
				else G = ExpRamp(0.22f, 0.0001f, (T - D * 0.8f) / (D * 0.2f + 0.25f));
				float NG;
				if (T < 0.05f) NG = ExpRamp(0.0001f, 0.05f, T / 0.05f);
				else NG = ExpRamp(0.05f, 0.0001f, (T - 0.05f) / (D + 0.15f));
				Out[I] = WaveAt(EWave::Sine, P) * G + BP.Process(NoiseRng.FRand() * 2.f - 1.f) * NG;
			}
		}
		else if (Inst == TEXT("pad"))
		{
			const float D = FMath::Max(0.5f, Dur);
			Out.SetNumZeroed(Len(D + 1.3f));
			double P[3] = {0, 0, 0};
			double P5 = 0;
			const float Det[3] = {-7.f, 0.f, 7.f};
			FBiquad LP;
			LP.Set(EFilter::Lowpass, 900.f, 0.707f);
			for (int32 I = 0; I < Out.Num(); I++)
			{
				const float T = float(I) / SR;
				float V = 0.f;
				for (int32 K = 0; K < 3; K++)
				{
					P[K] += F * FMath::Pow(2.f, Det[K] / 1200.f) / SR;
					V += WaveAt(EWave::Saw, P[K]);
				}
				P5 += F * 1.5f / SR;
				V += WaveAt(EWave::Triangle, P5) * 0.3f;
				float G;
				if (T < 0.6f) G = ExpRamp(0.0001f, 0.12f, T / 0.6f);
				else if (T < D) G = 0.12f;
				else G = ExpRamp(0.12f, 0.0001f, (T - D) / 1.2f);
				Out[I] = LP.Process(V) * G;
			}
		}
		else if (Inst == TEXT("bass"))
		{
			Out.SetNumZeroed(Len(Dur + 0.3f));
			double P = 0;
			for (int32 I = 0; I < Out.Num(); I++)
			{
				const float T = float(I) / SR;
				P += F / SR;
				Out[I] = WaveAt(EWave::Triangle, P) * Env(T, 0.01f, 0.4f, FMath::Max(0.2f, Dur * 0.9f));
			}
		}
		else if (Inst == TEXT("taiko"))
		{
			Out.SetNumZeroed(Len(0.5f));
			double P = 0;
			FBiquad LP;
			LP.Set(EFilter::Lowpass, 500.f, 0.707f);
			for (int32 I = 0; I < Out.Num(); I++)
			{
				const float T = float(I) / SR;
				P += ExpRamp(110.f, 42.f, T / 0.3f) / SR;
				float V = WaveAt(EWave::Sine, P) * Env(T, 0.003f, 0.9f, 0.45f);
				if (T < 0.2f) V += LP.Process(NoiseRng.FRand() * 2.f - 1.f) * Env(T, 0.002f, 0.4f, 0.12f);
				Out[I] = V;
			}
		}
		else if (Inst == TEXT("ka") || Inst == TEXT("shaker"))
		{
			const bool bKa = Inst == TEXT("ka");
			Out.SetNumZeroed(Len(bKa ? 0.08f : 0.1f));
			FBiquad Fl;
			Fl.Set(bKa ? EFilter::Bandpass : EFilter::Highpass, bKa ? 2500.f : 6000.f, bKa ? 4.f : 0.707f);
			for (int32 I = 0; I < Out.Num(); I++)
			{
				const float T = float(I) / SR;
				Out[I] = Fl.Process(NoiseRng.FRand() * 2.f - 1.f) * (bKa ? Env(T, 0.001f, 0.5f, 0.05f) : Env(T, 0.01f, 0.2f, 0.06f));
			}
		}
		else if (Inst == TEXT("bell"))
		{
			Out.SetNumZeroed(Len(3.1f));
			const float Ratio[3] = {1.f, 2.76f, 5.4f};
			const float Amp[3] = {0.2f, 0.08f, 0.04f};
			const float Dec[3] = {3.f, 1.6f, 0.8f};
			for (int32 K = 0; K < 3; K++)
			{
				double P = 0;
				const int32 N = FMath::Min(Out.Num(), Len(Dec[K] + 0.1f));
				for (int32 I = 0; I < N; I++)
				{
					const float T = float(I) / SR;
					P += F * Ratio[K] / SR;
					Out[I] += WaveAt(EWave::Sine, P) * Env(T, 0.003f, Amp[K], Dec[K]);
				}
			}
		}
	}
}

// =================================================================== ULBAudio

void ULBAudio::Init(UWorld* InWorld)
{
	World = InWorld;
	if (Sfx.Num() > 0) return;
	const float Pitches[3] = {0.95f, 1.f, 1.05f};
	for (const TCHAR* Name : SfxNames)
	{
		TArray<TSharedPtr<TArray<int16>>>& Variants = Sfx.Add(Name);
		for (const float P : Pitches)
		{
			FMix M;
			M.Buf.SetNumZeroed(FMath::RoundToInt(2.3f * SR));
			Synth(Name, M, P);
			// Trim trailing silence.
			int32 End = M.Buf.Num();
			while (End > 1 && FMath::Abs(M.Buf[End - 1]) < 1e-4f) End--;
			M.Buf.SetNum(FMath::Min(M.Buf.Num(), End + SR / 50));
			Variants.Add(MakeShared<TArray<int16>>(ToPcm(M.Buf, 0.9f)));
		}
	}
}

void ULBAudio::SetVolumes(float Master, float Music, float SfxV)
{
	MasterVol = Master;
	MusicVol = Music;
	SfxVol = SfxV;
}

const ULBAudio::FTrackAudio* ULBAudio::GetTrack(const FString& Name)
{
	if (const FTrackAudio* Found = Tracks.Find(Name)) return Found;
	const FTrackDef* Def = TrackDefs().FindByPredicate([&](const FTrackDef& T) { return Name == T.Name; });
	if (!Def) return nullptr;
	static const int32 InScale[5] = {0, 1, 5, 7, 8};
	static const int32 YoScale[5] = {0, 2, 5, 7, 9};
	const int32* Scale = Def->bYo ? YoScale : InScale;
	const float StepDur = 60.f / Def->Bpm / 4.f;

	TArray<TArray<FStep>> Parsed;
	int32 Steps = 16;
	for (const FLayerDef& L : Def->Layers)
	{
		Parsed.Add(Parse(L.Pattern));
		const int32 N = FMath::Max(1, Parsed.Last().Num());
		// Least common multiple of all layer lengths (patterns are 16/32/64 steps).
		int32 A = Steps, B = N;
		while (B != 0)
		{
			const int32 Tmp = A % B;
			A = B;
			B = Tmp;
		}
		Steps = FMath::Min(256, Steps / A * N);
	}
	const int32 LoopSamples = FMath::RoundToInt(Steps * StepDur * SR);
	FMix Base, Combat;
	Base.bWrap = Combat.bWrap = true;
	Base.Buf.SetNumZeroed(LoopSamples);
	Combat.Buf.SetNumZeroed(LoopSamples);
	TArray<float> Note;
	for (int32 Li = 0; Li < Def->Layers.Num(); Li++)
	{
		const FLayerDef& L = Def->Layers[Li];
		const TArray<FStep>& S = Parsed[Li];
		if (S.Num() == 0) continue;
		FMix& Target = L.bCombat ? Combat : Base;
		for (int32 Step = 0; Step < Steps; Step++)
		{
			const FStep& St = S[Step % S.Num()];
			if (!St.bHit) continue;
			const int32 Oct = FMath::FloorToInt(float(St.Deg) / 5.f);
			const int32 Idx = ((St.Deg % 5) + 5) % 5;
			const int32 Midi = Def->Root + Scale[Idx] + 12 * (Oct + L.Octave);
			RenderNote(L.Inst, MidiToFreq(Midi), St.Len * StepDur, Note);
			const int32 Start = FMath::RoundToInt(Step * StepDur * SR);
			for (int32 I = 0; I < Note.Num(); I++) Target.Add(Start + I, Note[I] * L.Gain);
		}
	}
	FTrackAudio A;
	A.Base = MakeShared<TArray<int16>>(ToPcm(Base.Buf, 1.2f));
	A.Combat = MakeShared<TArray<int16>>(ToPcm(Combat.Buf, 1.2f));
	return &Tracks.Add(Name, A);
}

USoundWaveProcedural* ULBAudio::MakeWave(const TArray<int16>& Pcm, bool bLooping)
{
	USoundWaveProcedural* W = NewObject<USoundWaveProcedural>(this);
	W->SetSampleRate(SR);
	W->NumChannels = 1;
	W->Duration = bLooping ? INDEFINITELY_LOOPING_DURATION : float(Pcm.Num()) / SR;
	W->SoundGroup = SOUNDGROUP_Default;
	W->bLooping = false;
	W->QueueAudio(reinterpret_cast<const uint8*>(Pcm.GetData()), Pcm.Num() * sizeof(int16));
	return W;
}

UAudioComponent* ULBAudio::MakeComponent(USoundWaveProcedural* Wave)
{
	if (!World) return nullptr;
	UAudioComponent* C = UGameplayStatics::CreateSound2D(World, Wave, 1.f, 1.f, 0.f, nullptr, true, false);
	if (C) Keep.Add(C);
	Keep.Add(Wave);
	return C;
}

void ULBAudio::Play(const FString& Name, float X, float Z, float Volume, bool bPositional)
{
	const FString Caption = CaptionFor(Name);
	if (!Caption.IsEmpty() && OnCaption) OnCaption(Caption);
	const TArray<TSharedPtr<TArray<int16>>>* Variants = Sfx.Find(Name);
	if (!Variants || Variants->Num() == 0 || !World) return;
	const double Now = FPlatformTime::Seconds();
	double& Last = LastPlayed.FindOrAdd(Name);
	if (Now - Last < 0.03) return;
	Last = Now;
	float Vol = Volume;
	if (bPositional)
	{
		const float D = FMath::Sqrt(FMath::Square(X - ListenerX) + FMath::Square(Z - ListenerZ));
		Vol *= 1.f / (1.f + D * 0.07f);
	}
	Vol *= MasterVol * SfxVol;
	if (Vol < 0.02f) return;
	// Too many voices: drop the sound (like the browser's natural limit).
	if (Voices.Num() >= 24) return;
	const TArray<int16>& Pcm = *(*Variants)[FMath::RandRange(0, Variants->Num() - 1)];
	USoundWaveProcedural* Wave = MakeWave(Pcm, false);
	UAudioComponent* C = MakeComponent(Wave);
	if (!C) return;
	C->SetVolumeMultiplier(Vol);
	C->Play();
	FVoice V;
	V.Comp = C;
	V.Wave = Wave;
	V.EndTime = Now + double(Pcm.Num()) / SR + 0.1;
	Voices.Add(V);
}

void ULBAudio::StopPlayer(FMusicPlayer& P)
{
	for (UAudioComponent* C : {P.BaseComp, P.CombatComp})
	{
		if (C)
		{
			C->Stop();
			Keep.Remove(C);
			C->DestroyComponent();
		}
	}
	Keep.Remove(P.BaseWave);
	Keep.Remove(P.CombatWave);
	P.BaseComp = P.CombatComp = nullptr;
}

void ULBAudio::PlayMusic(const FString& Track)
{
	if (Players.Num() > 0 && Players.Last().Track == Track && Players.Last().FadeTarget > 0.f) return;
	for (FMusicPlayer& P : Players) P.FadeTarget = 0.f;
	if (Track.IsEmpty()) return;
	const FTrackAudio* A = GetTrack(Track);
	if (!A || !A->Base.IsValid() || A->Base->Num() == 0) return;
	FMusicPlayer P;
	P.Track = Track;
	P.BaseData = A->Base;
	P.CombatData = A->Combat;
	P.BaseWave = MakeWave(*A->Base, true);
	P.BaseWave->QueueAudio(reinterpret_cast<const uint8*>(A->Base->GetData()), A->Base->Num() * sizeof(int16));
	P.CombatWave = MakeWave(*A->Combat, true);
	P.CombatWave->QueueAudio(reinterpret_cast<const uint8*>(A->Combat->GetData()), A->Combat->Num() * sizeof(int16));
	P.BaseComp = MakeComponent(P.BaseWave);
	P.CombatComp = MakeComponent(P.CombatWave);
	if (P.BaseComp)
	{
		P.BaseComp->SetVolumeMultiplier(0.001f);
		P.BaseComp->Play();
	}
	if (P.CombatComp)
	{
		P.CombatComp->SetVolumeMultiplier(0.001f);
		P.CombatComp->Play();
	}
	Players.Add(P);
}

void ULBAudio::Tick(float Dt)
{
	const double Now = FPlatformTime::Seconds();
	for (int32 I = Voices.Num() - 1; I >= 0; I--)
	{
		if (Now < Voices[I].EndTime && IsValid(Voices[I].Comp)) continue;
		if (IsValid(Voices[I].Comp))
		{
			Voices[I].Comp->Stop();
			Keep.Remove(Voices[I].Comp);
			Voices[I].Comp->DestroyComponent();
		}
		Keep.Remove(Voices[I].Wave);
		Voices.RemoveAt(I);
	}

	Combat += (CombatTarget - Combat) * FMath::Min(1.f, Dt * 1.2f);
	for (int32 I = Players.Num() - 1; I >= 0; I--)
	{
		FMusicPlayer& P = Players[I];
		P.Fade = FMath::FInterpConstantTo(P.Fade, P.FadeTarget, Dt, P.FadeTarget > P.Fade ? 0.8f : 1.2f);
		const float Vol = FMath::Max(0.001f, P.Fade * MasterVol * MusicVol * 0.55f);
		if (P.BaseComp) P.BaseComp->SetVolumeMultiplier(Vol);
		if (P.CombatComp) P.CombatComp->SetVolumeMultiplier(FMath::Max(0.001f, Vol * Combat));
		// Keep at least one loop queued so playback never runs dry.
		if (P.BaseWave && P.BaseData.IsValid() && P.BaseWave->GetAvailableAudioByteCount() < P.BaseData->Num() * int32(sizeof(int16)))
			P.BaseWave->QueueAudio(reinterpret_cast<const uint8*>(P.BaseData->GetData()), P.BaseData->Num() * sizeof(int16));
		if (P.CombatWave && P.CombatData.IsValid() && P.CombatWave->GetAvailableAudioByteCount() < P.CombatData->Num() * int32(sizeof(int16)))
			P.CombatWave->QueueAudio(reinterpret_cast<const uint8*>(P.CombatData->GetData()), P.CombatData->Num() * sizeof(int16));
		if (P.FadeTarget <= 0.f && P.Fade <= 0.f)
		{
			StopPlayer(P);
			Players.RemoveAt(I);
		}
	}
}
