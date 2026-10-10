#include "LBFx.h"
#include "LBMath.h"
#include "LBMeshKit.h"
#include "ProceduralMeshComponent.h"

ALBFx::ALBFx()
{
	PrimaryActorTick.bCanEverTick = false;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Rng.Initialize(9157);
}

UProceduralMeshComponent* ALBFx::NewMesh()
{
	UProceduralMeshComponent* M = NewObject<UProceduralMeshComponent>(this);
	M->SetupAttachment(RootComponent);
	M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	M->SetCastShadow(false);
	M->RegisterComponent();
	return M;
}

void ALBFx::InitPool(FPool& Pool, int32 Capacity, float Size, bool bAdditive)
{
	Pool.Parts.SetNum(Capacity);
	Pool.Capacity = Capacity;
	Pool.Size = Size;
	if (!Pool.Mesh) Pool.Mesh = NewMesh();
	Pool.Mesh->SetMaterial(0, LBMaterials::Get(bAdditive ? ELBMat::Additive : ELBMat::Translucent));
}

void ALBFx::Spawn(FPool& Pool, const FVector& P, const FVector& V, float Life, const FLinearColor& C, float Gravity, float Drag)
{
	if (Pool.Capacity == 0) return;
	// Reuse the particle with the least life left (ring-buffer behaviour of the web build).
	int32 Best = 0;
	float BestLife = TNumericLimits<float>::Max();
	for (int32 I = 0; I < Pool.Parts.Num(); I++)
	{
		if (Pool.Parts[I].Life <= 0.f)
		{
			Best = I;
			break;
		}
		if (Pool.Parts[I].Life < BestLife)
		{
			BestLife = Pool.Parts[I].Life;
			Best = I;
		}
	}
	FParticle& Pa = Pool.Parts[Best];
	Pa.P = P;
	Pa.V = V;
	Pa.Life = Life;
	Pa.MaxLife = Life;
	Pa.C = C;
	Pa.Gravity = Gravity;
	Pa.Drag = Drag;
}

void ALBFx::Burst(float X, float Y, float Z, const FLBBurst& B)
{
	if (Sparks.Capacity == 0)
	{
		InitPool(Sparks, 600, 0.18f, true);
		InitPool(Embers, 500, 0.35f, true);
		InitPool(Smoke, 200, 1.6f, false);
	}
	FPool& Pool = B.Size == 2 ? Smoke : B.Size == 1 ? Embers : Sparks;
	const FLinearColor C = LB::Hex(B.Color);
	const int32 N = bReduceFlashing ? FMath::CeilToInt(B.Count / 2.f) : B.Count;
	const float UpBias = B.UpBias < 0.f ? 0.6f : B.UpBias;
	const float ExtraUp = B.UpBias < 0.f ? 0.f : B.UpBias;
	for (int32 I = 0; I < N; I++)
	{
		const float Th = Rng.FRand() * 2.f * UE_PI;
		const float Ph = FMath::Acos(2.f * Rng.FRand() - 1.f);
		const float Sp = B.Speed * (0.4f + Rng.FRand() * 0.6f);
		const FVector P(X + (Rng.FRand() - 0.5f) * B.Spread, Y + (Rng.FRand() - 0.5f) * B.Spread, Z + (Rng.FRand() - 0.5f) * B.Spread);
		const FVector V(FMath::Sin(Ph) * FMath::Cos(Th) * Sp, FMath::Abs(FMath::Cos(Ph)) * Sp * UpBias + ExtraUp * Sp * 0.5f, FMath::Sin(Ph) * FMath::Sin(Th) * Sp);
		Spawn(Pool, P, V, B.Life * (0.6f + Rng.FRand() * 0.4f), C, B.Gravity, B.Drag);
	}
}

void ALBFx::HitSpark(float X, float Y, float Z, bool bCrit, int32 Color)
{
	FLBBurst B;
	B.Count = bCrit ? 26 : 14;
	B.Color = Color;
	B.Speed = bCrit ? 9.f : 6.f;
	B.Life = 0.35f;
	B.Gravity = 10.f;
	Burst(X, Y, Z, B);
	if (bCrit)
	{
		FLBBurst W;
		W.Count = 6;
		W.Color = 0xffffff;
		W.Speed = 3.f;
		W.Life = 0.25f;
		W.Size = 1;
		Burst(X, Y, Z, W);
	}
}

void ALBFx::DeathPuff(float X, float Y, float Z, int32 Color)
{
	FLBBurst A;
	A.Count = 18;
	A.Color = Color;
	A.Speed = 2.5f;
	A.Life = 1.2f;
	A.Gravity = -1.5f;
	A.Size = 1;
	A.Spread = 0.8f;
	Burst(X, Y + 0.6f, Z, A);
	FLBBurst S;
	S.Count = 6;
	S.Color = 0x2a2030;
	S.Speed = 1.2f;
	S.Life = 1.4f;
	S.Gravity = -0.6f;
	S.Size = 2;
	S.Spread = 0.6f;
	Burst(X, Y + 0.4f, Z, S);
}

void ALBFx::Shockwave(float X, float Y, float Z, float Radius, int32 Color, float Life)
{
	FWave W;
	W.P = FVector(X, Y + 0.1f, Z);
	W.Life = Life;
	W.To = Radius;
	W.Color = Color;
	W.Mesh = NewMesh();
	Waves.Add(W);
}

void ALBFx::SetAmbient(const FLBAmbientDef* Def)
{
	bHasAmbient = Def != nullptr;
	if (!Def)
	{
		if (Ambient.Mesh) Ambient.Mesh->ClearAllMeshSections();
		Ambient.Parts.Reset();
		Ambient.Capacity = 0;
		return;
	}
	AmbientDef = *Def;
	InitPool(Ambient, FMath::Clamp(Def->Count, 1, 1000), Def->Size, Def->Kind != TEXT("petals") && Def->Kind != TEXT("ash"));
	for (FParticle& P : Ambient.Parts) P.Life = 0.f;
}

// =================================================================== Telegraphs

int32 ALBFx::Telegraph(ELBTeleShape Shape, float A, float B, float X, float Y, float Z, float Yaw, float Duration)
{
	FTele T;
	T.Handle = NextHandle++;
	T.Shape = Shape;
	T.A = A;
	T.B = B;
	T.Duration = FMath::Max(0.01f, Duration);
	T.Pivot = NewObject<USceneComponent>(this);
	T.Pivot->SetupAttachment(RootComponent);
	T.Pivot->RegisterComponent();
	T.Fill = NewMesh();
	T.Fill->AttachToComponent(T.Pivot, FAttachmentTransformRules::KeepRelativeTransform);
	T.Edge = NewMesh();
	T.Edge->AttachToComponent(T.Pivot, FAttachmentTransformRules::KeepRelativeTransform);

	// Translucent material doubles the colour: store half.
	FLinearColor FillC = LB::Hex(bHighContrast ? 0xffe600 : 0xff3a2a) * 0.5f;
	FillC.A = bHighContrast ? 0.38f : 0.32f;
	FLinearColor EdgeC = LB::Hex(bHighContrast ? 0xff00c8 : 0xff6a3a) * 0.5f;
	EdgeC.A = bHighContrast ? 0.95f : 0.85f;
	FLBMeshBuilder F, E;
	switch (Shape)
	{
	case ELBTeleShape::Circle:
		F.Sector(FVector::ZeroVector, 0.f, A * 100.f, 0.f, 360.f, 40, FillC);
		E.Sector(FVector::ZeroVector, A * 94.f, A * 100.f, 0.f, 360.f, 40, EdgeC);
		break;
	case ELBTeleShape::Ring:
		F.Sector(FVector::ZeroVector, FMath::Max(1.f, (A - 0.8f) * 100.f), A * 100.f, 0.f, 360.f, 64, FillC);
		E.Sector(FVector::ZeroVector, (A - 0.1f) * 100.f, A * 100.f, 0.f, 360.f, 64, EdgeC);
		break;
	case ELBTeleShape::Cone:
		// A = radius, B = arc in degrees, centred on the attacker's forward (+X).
		F.Sector(FVector::ZeroVector, 0.f, A * 100.f, -B / 2.f, B, 32, FillC);
		E.Sector(FVector::ZeroVector, A * 93.f, A * 100.f, -B / 2.f, B, 32, EdgeC);
		break;
	case ELBTeleShape::Line:
		// A = length, B = width.
		F.Quad(FVector(0, -B * 50.f, 0), FVector(A * 100.f, -B * 50.f, 0), FVector(A * 100.f, B * 50.f, 0), FVector(0, B * 50.f, 0), FillC);
		E.Quad(FVector(A * 100.f - 15.f, -B * 50.f, 0), FVector(A * 100.f, -B * 50.f, 0), FVector(A * 100.f, B * 50.f, 0), FVector(A * 100.f - 15.f, B * 50.f, 0), EdgeC);
		break;
	}
	F.Build(T.Fill, 0, false, LBMaterials::Get(ELBMat::Translucent));
	E.Build(T.Edge, 0, false, LBMaterials::Get(ELBMat::Translucent));
	T.Fill->SetRelativeLocation(FVector(0, 0, 1.f));
	T.Edge->SetRelativeLocation(FVector(0, 0, 2.f));
	Teles.Add(T);
	MoveTelegraph(T.Handle, X, Y, Z, Yaw);
	return T.Handle;
}

void ALBFx::MoveTelegraph(int32 Handle, float X, float Y, float Z, float Yaw)
{
	for (FTele& T : Teles)
	{
		if (T.Handle != Handle) continue;
		if (T.Pivot) T.Pivot->SetWorldLocationAndRotation(LB::ToWorld(X, Z, Y + 0.06f), FRotator(0.f, LB::YawToUE(Yaw), 0.f));
	}
}

void ALBFx::RemoveTelegraph(int32 Handle)
{
	for (int32 I = Teles.Num() - 1; I >= 0; I--)
	{
		if (Teles[I].Handle != Handle) continue;
		if (Teles[I].Fill) Teles[I].Fill->DestroyComponent();
		if (Teles[I].Edge) Teles[I].Edge->DestroyComponent();
		if (Teles[I].Pivot) Teles[I].Pivot->DestroyComponent();
		Teles.RemoveAt(I);
	}
}

// =================================================================== Trails & text

void ALBFx::TrailPush(const FVector& Base, const FVector& Tip)
{
	TrailSamples.Insert(Tip, 0);
	TrailSamples.Insert(Base, 0);
	if (TrailSamples.Num() > 24) TrailSamples.SetNum(24);
	TrailFade = 1.f;
}

void ALBFx::FloatText(float X, float Y, float Z, const FString& Text, const FLinearColor& Color, float Life, float Scale, bool bDamage)
{
	if (bDamage && !bDamageNumbers) return;
	if (Floats.Num() > 40) Floats.RemoveAt(0);
	FLBFloatText F;
	F.Pos = LB::ToWorld(X + (Rng.FRand() - 0.5f) * 0.6f, Z + (Rng.FRand() - 0.5f) * 0.6f, Y);
	F.Text = Text;
	F.Color = Color;
	F.Life = Life;
	F.Scale = Scale;
	F.bDamage = bDamage;
	Floats.Add(F);
}

// =================================================================== Update

void ALBFx::UpdatePool(FPool& Pool, float Dt, const FVector& Right, const FVector& Up, bool bPetals)
{
	if (!Pool.Mesh || Pool.Capacity == 0) return;
	FLBMeshBuilder M;
	const float S = Pool.Size * 50.f;
	for (FParticle& P : Pool.Parts)
	{
		if (P.Life <= 0.f) continue;
		P.Life -= Dt;
		if (P.Life <= 0.f) continue;
		const float Dk = FMath::Exp(-P.Drag * Dt);
		P.V.X *= Dk;
		P.V.Z *= Dk;
		P.V.Y = P.V.Y * Dk - P.Gravity * Dt;
		P.P += P.V * Dt;
		const float F = FMath::Min(1.f, P.Life / P.MaxLife * 1.5f);
		FLinearColor C = P.C * 0.5f;
		C.A = F;
		if (!bPetals) C = FLinearColor(C.R * F, C.G * F, C.B * F, F);
		const FVector W = LB::ToWorld(P.P.X, P.P.Z, P.P.Y);
		M.Quad(W - Right * S - Up * S, W + Right * S - Up * S, W + Right * S + Up * S, W - Right * S + Up * S, C);
	}
	if (M.IsEmpty()) Pool.Mesh->ClearAllMeshSections();
	else
	{
		UMaterialInterface* Mat = Pool.Mesh->GetMaterial(0);
		M.Build(Pool.Mesh, 0, false, Mat);
	}
}

void ALBFx::Step(float Dt, const FRotator& CameraRot, const FVector& Focus)
{
	const FRotationMatrix R(CameraRot);
	const FVector Right = R.GetScaledAxis(EAxis::Y);
	const FVector Up = R.GetScaledAxis(EAxis::Z);

	UpdatePool(Sparks, Dt, Right, Up, false);
	UpdatePool(Embers, Dt, Right, Up, false);
	UpdatePool(Smoke, Dt, Right, Up, true);

	if (bHasAmbient && Ambient.Capacity > 0)
	{
		const FLBAmbientDef& C = AmbientDef;
		AmbientTimer += Dt;
		const float Interval = 1.f / FMath::Max(0.1f, C.Rate);
		const FLinearColor Col = LB::Hex(C.Color);
		while (AmbientTimer > Interval)
		{
			AmbientTimer -= Interval;
			const FVector P(Focus.X + (Rng.FRand() - 0.5f) * C.Radius * 2.f, Focus.Y + C.YMin + Rng.FRand() * (C.YMax - C.YMin), Focus.Z + (Rng.FRand() - 0.5f) * C.Radius * 2.f);
			const float W = C.Wander;
			Spawn(Ambient, P, FVector((Rng.FRand() - 0.5f) * W + C.Wind, C.Vy + (Rng.FRand() - 0.5f) * W * 0.5f, (Rng.FRand() - 0.5f) * W), C.Life, Col, 0.f, 0.2f);
		}
		UpdatePool(Ambient, Dt, Right, Up, C.Kind == TEXT("petals") || C.Kind == TEXT("ash"));
	}

	// Telegraphs: the fill grows toward the edge as the attack winds up.
	for (int32 I = Teles.Num() - 1; I >= 0; I--)
	{
		FTele& T = Teles[I];
		T.T += Dt;
		const float P = FMath::Min(1.f, T.T / T.Duration);
		if (T.Fill)
		{
			if (T.Shape == ELBTeleShape::Line) T.Fill->SetRelativeScale3D(FVector(FMath::Max(0.02f, P), 1.f, 1.f));
			else if (T.Shape == ELBTeleShape::Ring) T.Fill->SetRelativeScale3D(FVector(1.f));
			else T.Fill->SetRelativeScale3D(FVector(FMath::Max(0.05f, P), FMath::Max(0.05f, P), 1.f));
		}
		if (T.T >= T.Duration + 0.12f) RemoveTelegraph(T.Handle);
	}

	// Shockwave rings
	for (int32 I = Waves.Num() - 1; I >= 0; I--)
	{
		FWave& W = Waves[I];
		W.T += Dt;
		const float P = FMath::Min(1.f, W.T / W.Life);
		const float Radius = (0.2f + (W.To - 0.2f) * (1.f - FMath::Square(1.f - P))) * 100.f;
		if (W.T >= W.Life || !W.Mesh)
		{
			if (W.Mesh) W.Mesh->DestroyComponent();
			Waves.RemoveAt(I);
			continue;
		}
		FLBMeshBuilder M;
		FLinearColor C = LB::Hex(W.Color) * 0.5f;
		C.A = 0.8f * (1.f - P);
		M.Sector(LB::ToWorld(W.P.X, W.P.Z, W.P.Y), Radius * 0.85f, Radius, 0.f, 360.f, 48, C);
		M.Build(W.Mesh, 0, false, LBMaterials::Get(ELBMat::Additive));
	}

	// Weapon trail
	if (!TrailMesh) TrailMesh = NewMesh();
	if (!bTrailActive)
	{
		TrailFade -= Dt * 6.f;
		if (TrailFade <= 0.f) TrailSamples.Reset();
	}
	if (TrailSamples.Num() >= 4 && TrailFade > 0.f)
	{
		FLBMeshBuilder M;
		const int32 N = TrailSamples.Num() / 2;
		const FLinearColor Base = LB::Hex(TrailColor) * 0.5f;
		for (int32 I = 0; I + 1 < N; I++)
		{
			const float A0 = (1.f - float(I) / FMath::Max(1, N - 1)) * TrailFade * 0.85f;
			const float A1 = (1.f - float(I + 1) / FMath::Max(1, N - 1)) * TrailFade * 0.85f;
			FLinearColor C = Base;
			C.A = (A0 + A1) * 0.5f;
			M.Quad(TrailSamples[I * 2], TrailSamples[I * 2 + 1], TrailSamples[I * 2 + 3], TrailSamples[I * 2 + 2], C);
		}
		M.Build(TrailMesh, 0, false, LBMaterials::Get(ELBMat::Additive));
	}
	else TrailMesh->ClearAllMeshSections();

	// Floating text rises and fades (drawn by the HUD).
	for (int32 I = Floats.Num() - 1; I >= 0; I--)
	{
		FLBFloatText& F = Floats[I];
		F.T += Dt;
		F.Pos.Z += F.Vy * Dt;
		F.Vy *= FMath::Exp(-Dt * 2.f);
		if (F.T >= F.Life) Floats.RemoveAt(I);
	}
}

void ALBFx::ClearTransient()
{
	for (FPool* P : {&Sparks, &Embers, &Smoke, &Ambient})
	{
		for (FParticle& Pa : P->Parts) Pa.Life = 0.f;
		if (P->Mesh) P->Mesh->ClearAllMeshSections();
	}
	while (Teles.Num() > 0) RemoveTelegraph(Teles[0].Handle);
	for (FWave& W : Waves) if (W.Mesh) W.Mesh->DestroyComponent();
	Waves.Reset();
	Floats.Reset();
	TrailSamples.Reset();
}
