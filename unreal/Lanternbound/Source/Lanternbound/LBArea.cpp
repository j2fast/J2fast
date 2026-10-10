#include "LBArea.h"
#include "LBData.h"
#include "LBMath.h"
#include "LBMeshKit.h"
#include "LBRules.h"
#include "Lanternbound.h"
#include "Components/PointLightComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "ProceduralMeshComponent.h"

ALBArea::ALBArea()
{
	PrimaryActorTick.bCanEverTick = false;
	SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = SceneRoot;
}

TArray<FLBScenePart>& ALBArea::PropTemplates()
{
	static TArray<FLBScenePart> Templates;
	static bool bLoaded = false;
	if (!bLoaded)
	{
		bLoaded = true;
		FString Error;
		if (!LBScene::Load(TEXT("props.lbm"), Templates, Error)) UE_LOG(LogLanternbound, Error, TEXT("%s"), *Error);
	}
	return Templates;
}

FVector ALBArea::World(float X, float Z, float UpMetres) const
{
	return LB::ToWorld(X, Z, GroundY(X, Z) + UpMetres);
}

bool ALBArea::Build(const FString& AreaId, const FLBGameData& G, FString& Error)
{
	ULBData* D = ULBData::Get(this);
	Data = D ? D->GetArea(AreaId) : nullptr;
	if (!Data)
	{
		Error = FString::Printf(TEXT("Area data for '%s' is missing."), *AreaId);
		return false;
	}

	// Colliders (copied so the game can add/disable some at runtime).
	Colliders.Reset();
	for (const FLBColliderDef& C : Data->Colliders)
	{
		FLBCollider N;
		N.bCircle = C.Kind == TEXT("circle");
		N.X = C.X;
		N.Z = C.Z;
		N.R = C.R;
		N.MinX = C.MinX;
		N.MaxX = C.MaxX;
		N.MinZ = C.MinZ;
		N.MaxZ = C.MaxZ;
		N.H = C.H;
		N.Id = C.Id;
		Colliders.Add(N);
	}

	// Scenery meshes.
	TArray<FLBScenePart> SceneParts;
	FString MeshError;
	if (!LBScene::Load(FString::Printf(TEXT("area_%s.lbm"), *AreaId), SceneParts, MeshError))
	{
		Error = MeshError;
		return false;
	}
	for (const FLBScenePart& P : SceneParts)
	{
		// The unnamed scenery and the ground are large: split them into tiles for culling.
		const float Tile = (P.Name.IsEmpty() || P.Name == TEXT("ground")) ? 3200.f : 0.f;
		Parts.Add(LBScene::Spawn(this, SceneRoot, P, Tile));
	}

	// Lights placed in the scene.
	for (const FLBLightDef& L : Data->Lights)
	{
		UPointLightComponent* PL = NewObject<UPointLightComponent>(this);
		PL->SetMobility(EComponentMobility::Movable);
		PL->SetupAttachment(SceneRoot);
		PL->SetRelativeLocation(FVector(L.X, L.Y, L.Z));
		PL->SetIntensityUnits(ELightUnits::Candelas);
		PL->SetIntensity(L.Intensity * 1.6f);
		PL->SetLightColor(LB::Hex(L.Color));
		PL->SetAttenuationRadius(L.Distance > 0.f ? L.Distance * 100.f : 2500.f);
		PL->SetCastShadows(false);
		PL->ComponentTags.Add(FName(*L.Name));
		PL->RegisterComponent();
		Lights.Add(PL);
	}

	// Sun
	const FLBEnvDef& Env = Data->Env;
	Sun = NewObject<UDirectionalLightComponent>(this);
	Sun->SetMobility(EComponentMobility::Movable);
	Sun->SetupAttachment(SceneRoot);
	const FVector SunDir = FVector(Env.SunDirZ, -Env.SunDirX, Env.SunDirY).GetSafeNormal();
	Sun->SetWorldRotation((-SunDir).Rotation());
	Sun->SetIntensity(Env.SunIntensity * 1.8f);
	Sun->SetLightColor(LB::Hex(Env.SunColor));
	Sun->SetCastShadows(true);
	Sun->SetAtmosphereSunLight(false);
	Sun->RegisterComponent();

	BuildSky();

	// Ambient light from the sky dome (captured) with the hemisphere ground colour below.
	SkyLight = NewObject<USkyLightComponent>(this);
	SkyLight->SetMobility(EComponentMobility::Movable);
	SkyLight->SetupAttachment(SceneRoot);
	SkyLight->SourceType = ESkyLightSourceType::SLS_CapturedScene;
	SkyLight->bLowerHemisphereIsBlack = false;
	SkyLight->SetLowerHemisphereColor(LB::Hex(Env.HemiGround));
	SkyLight->SetIntensity(FMath::Max(0.3f, Env.HemiIntensity) * 0.6f);
	SkyLight->RegisterComponent();
	SkyLight->RecaptureSky();

	// Fog: the web build uses linear fog between FogNear and FogFar; match its far end.
	Fog = NewObject<UExponentialHeightFogComponent>(this);
	Fog->SetupAttachment(SceneRoot);
	Fog->SetFogDensity(FMath::Clamp(30.f / FMath::Max(10.f, Env.FogFar), 0.002f, 0.5f));
	Fog->SetFogHeightFalloff(0.001f);
	Fog->SetStartDistance(Env.FogNear * 100.f);
	Fog->SetFogInscatteringColor(LB::Hex(Env.FogColor));
	Fog->SetFogMaxOpacity(1.f);
	Fog->SetFogCutoffDistance(30000.f);
	Fog->RegisterComponent();

	// Interactables
	Interactables.Reset();
	for (const FLBInteractDef& Def : Data->Interactables) BuildInteractable(Def, G);

	RefreshDynamic(G);
	return true;
}

void ALBArea::BuildSky()
{
	const FLBEnvDef& Env = Data->Env;
	const FLinearColor Top = LB::Hex(Env.SkyTop);
	const FLinearColor Bottom = LB::Hex(Env.SkyBottom);
	FLBMeshBuilder M;
	const int32 Segs = 24;
	const int32 Rings = 12;
	const float R = 40000.f;
	auto P = [&](int32 S, int32 Ri) {
		const float Theta = PI * Ri / Rings;
		const float Phi = 2.f * PI * S / Segs;
		return FVector(FMath::Sin(Theta) * FMath::Cos(Phi) * R, FMath::Sin(Theta) * FMath::Sin(Phi) * R, FMath::Cos(Theta) * R);
	};
	auto Col = [&](const FVector& V) {
		const float H = V.Z / R;
		const float T = FMath::SmoothStep(-0.1f, 0.6f, H);
		// Unlit material doubles the colour, so store half.
		return FMath::Lerp(Bottom, Top, T) * 0.5f;
	};
	for (int32 Ri = 0; Ri < Rings; Ri++)
	{
		for (int32 S = 0; S < Segs; S++)
		{
			const FVector A = P(S, Ri), B = P(S + 1, Ri), C = P(S + 1, Ri + 1), D = P(S, Ri + 1);
			// Per-vertex gradient: build the quad as two triangles with their own colours.
			const int32 Base = M.Verts.Num();
			for (const FVector& V : {A, B, C, A, C, D})
			{
				M.Verts.Add(V);
				M.Normals.Add(-V.GetSafeNormal());
				M.Colors.Add(Col(V));
				M.UVs.Add(FVector2D::ZeroVector);
			}
			// Seen from inside: emit both windings so culling never hides it.
			M.Tris.Append({Base, Base + 1, Base + 2, Base + 3, Base + 4, Base + 5});
			M.Tris.Append({Base, Base + 2, Base + 1, Base + 3, Base + 5, Base + 4});
		}
	}
	if (Env.Stars)
	{
		FRandomStream Rng(1234);
		for (int32 I = 0; I < 400; I++)
		{
			const float Th = Rng.FRand() * 2.f * PI;
			const float Ph = Rng.FRand() * PI * 0.45f;
			const FVector C(FMath::Cos(Th) * FMath::Sin(Ph) * R * 0.97f, FMath::Sin(Th) * FMath::Sin(Ph) * R * 0.97f, FMath::Cos(Ph) * R * 0.97f);
			M.Sphere(C, FVector(45.f), 4, 3, FLinearColor(0.5f, 0.5f, 0.5f));
		}
	}
	if (Env.Moon)
	{
		// Web: moon at (-120, 170, 300) -> Unreal axes.
		const FVector Dir = FVector(300.f, 120.f, 170.f).GetSafeNormal();
		M.Sphere(Dir * R * 0.9f, FVector(1300.f), 16, 10, LB::Hex(0xffe8d0) * 0.5f);
	}
	SkyDome = NewObject<UProceduralMeshComponent>(this);
	SkyDome->SetupAttachment(SceneRoot);
	SkyDome->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SkyDome->SetCastShadow(false);
	SkyDome->bAffectDistanceFieldLighting = false;
	SkyDome->RegisterComponent();
	M.Build(SkyDome, 0, false, LBMaterials::Get(ELBMat::Unlit));
}

void ALBArea::FollowView(const FVector& ViewLocation)
{
	if (SkyDome) SkyDome->SetWorldLocation(FVector(ViewLocation.X, ViewLocation.Y, 0.f));
}

void ALBArea::Animate(float Time)
{
	// Fires flicker slightly.
	for (int32 I = 0; I < Lights.Num(); I++)
	{
		UPointLightComponent* L = Lights[I];
		if (!L || L->ComponentHasTag(TEXT("lanternLight"))) continue;
		const FLBLightDef* Def = Data && Data->Lights.IsValidIndex(I) ? &Data->Lights[I] : nullptr;
		if (!Def) continue;
		const float F = 1.f + 0.08f * FMath::Sin(Time * 9.f + I * 1.7f) + 0.05f * FMath::Sin(Time * 23.f + I);
		L->SetIntensity(Def->Intensity * 1.6f * F);
	}
	if (FLBSpawnedPart* W = FindPart(TEXT("water")))
	{
		if (W->Pivot) W->Pivot->SetRelativeLocation(W->BaseLocation + FVector(0, 0, FMath::Sin(Time * 0.8f) * 3.f));
	}
}

// =================================================================== Interactables

FString ALBArea::InteractVisualName(const FLBInteractDef& Def, const FLBGameData& G) const
{
	if (Def.Kind == TEXT("chest")) return G.OpenedChests.Contains(Def.Id) ? TEXT("chest_open") : TEXT("chest_closed");
	if (Def.Kind == TEXT("brazier")) return G.LitBraziers.Contains(Def.Id) ? TEXT("brazier_lit") : TEXT("brazier_unlit");
	if (Def.Kind == TEXT("seal")) return FLBRules::GetFlag(G, Def.Id) > 0 ? TEXT("seal_lit") : TEXT("seal_unlit");
	return FString(); // wayshrines and the lantern are part of the scenery
}

FLBSpawnedPart ALBArea::SpawnProp(const FString& Name, const FVector& Location, float YawDeg, const FVector& Scale)
{
	for (const FLBScenePart& T : PropTemplates())
	{
		if (T.Name != Name) continue;
		FLBScenePart Copy = T;
		Copy.Location = Location + FRotator(0.f, YawDeg, 0.f).RotateVector(T.Location);
		Copy.Yaw = YawDeg + T.Yaw;
		Copy.Scale = 1.f;
		FLBSpawnedPart P = LBScene::Spawn(this, SceneRoot, Copy, 0.f);
		if (P.Pivot) P.Pivot->SetRelativeScale3D(Scale);
		return P;
	}
	return FLBSpawnedPart();
}

void ALBArea::BuildInteractable(const FLBInteractDef& Def, const FLBGameData& G)
{
	FLBInteractObj Obj;
	Obj.Def = Def;
	Obj.VisualName = InteractVisualName(Def, G);
	if (!Obj.VisualName.IsEmpty()) Obj.Visual = SpawnProp(Obj.VisualName, LB::ToWorld(Def.X, Def.Z, HeightAt(Def.X, Def.Z)), LB::YawToUE(Def.Yaw));
	Interactables.Add(Obj);
	if (Def.Kind == TEXT("chest")) AddCircleCollider(Def.X, Def.Z, 0.7f, 1.f, FString());
	if (Def.Kind == TEXT("brazier") || Def.Kind == TEXT("seal")) AddCircleCollider(Def.X, Def.Z, 0.9f, 2.f, FString());
}

bool ALBArea::InteractableAvailable(const FLBInteractDef& Def, const FLBGameData& G) const
{
	if (ULBData* D = ULBData::Get(this))
	{
		if (!FLBRules::EvalCond(*D, G, Def.Requires)) return false;
	}
	if (Def.Kind == TEXT("chest")) return !G.OpenedChests.Contains(Def.Id);
	if (Def.Kind == TEXT("brazier")) return !G.LitBraziers.Contains(Def.Id);
	if (Def.Kind == TEXT("seal")) return FLBRules::GetFlag(G, Def.Id) <= 0;
	if (Def.Kind == TEXT("lantern")) return !G.bEnding;
	return true;
}

// =================================================================== Dynamic state

FLBSpawnedPart* ALBArea::FindPart(const FString& Name)
{
	for (FLBSpawnedPart& P : Parts)
	{
		if (P.Name == Name) return &P;
	}
	return nullptr;
}

void ALBArea::SetColliderEnabled(const FString& Id, bool bEnabled)
{
	for (FLBCollider& C : Colliders)
	{
		if (C.Id == Id) C.bDisabled = !bEnabled;
	}
}

void ALBArea::RemoveColliders(const FString& Id)
{
	Colliders.RemoveAll([&](const FLBCollider& C) { return C.Id == Id; });
}

void ALBArea::AddCircleCollider(float X, float Z, float R, float H, const FString& Id)
{
	FLBCollider C;
	C.bCircle = true;
	C.X = X;
	C.Z = Z;
	C.R = R;
	C.H = H;
	C.Id = Id;
	Colliders.Add(C);
}

void ALBArea::AddBoxCollider(float MinX, float MaxX, float MinZ, float MaxZ, float H, const FString& Id)
{
	FLBCollider C;
	C.bCircle = false;
	C.MinX = MinX;
	C.MaxX = MaxX;
	C.MinZ = MinZ;
	C.MaxZ = MaxZ;
	C.H = H;
	C.Id = Id;
	Colliders.Add(C);
}

void ALBArea::RefreshDynamic(const FLBGameData& G)
{
	if (!Data) return;
	// Swap chest / brazier / seal visuals when their state changed.
	for (FLBInteractObj& Obj : Interactables)
	{
		const FString Want = InteractVisualName(Obj.Def, G);
		if (Want.IsEmpty() || Want == Obj.VisualName) continue;
		if (Obj.Visual.Pivot)
		{
			for (UProceduralMeshComponent* M : Obj.Visual.Meshes) if (M) M->DestroyComponent();
			Obj.Visual.Pivot->DestroyComponent();
		}
		Obj.VisualName = Want;
		Obj.Visual = SpawnProp(Want, LB::ToWorld(Obj.Def.X, Obj.Def.Z, HeightAt(Obj.Def.X, Obj.Def.Z)), LB::YawToUE(Obj.Def.Yaw));
	}
	const FString& Id = Data->Id;
	auto SetVisible = [this](const TCHAR* Name, bool bVisible) {
		if (FLBSpawnedPart* P = FindPart(Name)) P->SetVisible(bVisible);
	};
	if (Id == TEXT("bamboo"))
	{
		const bool bJoined = FLBRules::GetFlag(G, TEXT("kohaku_joined")) > 0;
		SetVisible(TEXT("kohakuCage"), !bJoined);
		SetColliderEnabled(TEXT("kohakuCage"), !bJoined);
	}
	if (Id == TEXT("village")) SetVisible(TEXT("marshBar"), FLBRules::GetFlag(G, TEXT("marsh_open")) <= 0);
	if (Id == TEXT("marsh"))
	{
		const bool bOpen = FLBRules::GetFlag(G, TEXT("catacombs_open")) > 0;
		// Web: doorL.rotation.y = 1.4 rad, doorR = -1.4 rad (Unreal yaw is the negated angle).
		if (FLBSpawnedPart* L = FindPart(TEXT("doorL"))) if (L->Pivot) L->Pivot->SetRelativeRotation(FRotator(0.f, L->BaseYaw + (bOpen ? -80.2f : 0.f), 0.f));
		if (FLBSpawnedPart* R = FindPart(TEXT("doorR"))) if (R->Pivot) R->Pivot->SetRelativeRotation(FRotator(0.f, R->BaseYaw + (bOpen ? 80.2f : 0.f), 0.f));
		SetColliderEnabled(TEXT("catacombDoor"), !bOpen);
	}
	if (Id == TEXT("catacombs"))
	{
		const bool bOpen = FLBRules::GetFlag(G, TEXT("seal_east")) > 0 && FLBRules::GetFlag(G, TEXT("seal_west")) > 0;
		SetVisible(TEXT("bossDoor"), !bOpen);
		SetColliderEnabled(TEXT("bossDoor"), !bOpen);
	}
	if (Id == TEXT("summit")) SetLanternLit(G.bEnding);
	if (FLBSpawnedPart* Beacon = FindPart(TEXT("beacon")))
	{
		// The beacon over Hinoyama glows gold once the Lantern is relit.
		if (G.bEnding && !BeaconGlow && Beacon->Pivot)
		{
			FLBMeshBuilder M;
			M.Sphere(FVector::ZeroVector, FVector(240.f * 2.2f), 12, 8, LB::Hex(0xffd27a) * 0.5f);
			BeaconGlow = NewObject<UProceduralMeshComponent>(this);
			BeaconGlow->SetupAttachment(Beacon->Pivot);
			BeaconGlow->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			BeaconGlow->SetCastShadow(false);
			BeaconGlow->RegisterComponent();
			M.Build(BeaconGlow, 0, false, LBMaterials::Get(ELBMat::Unlit));
		}
		for (UProceduralMeshComponent* Mesh : Beacon->Meshes) if (Mesh) Mesh->SetVisibility(!G.bEnding);
		if (BeaconGlow) BeaconGlow->SetVisibility(G.bEnding);
	}
}

void ALBArea::SetLanternLit(bool bLit)
{
	bLanternLit = bLit;
	FLBSpawnedPart* Core = FindPart(TEXT("core"));
	FLBSpawnedPart* Halo = FindPart(TEXT("halo"));
	if (Core && Core->Pivot && !LanternGlow)
	{
		FLBMeshBuilder M;
		// Octahedron core, bright gold.
		const FLinearColor C = LB::Hex(0xffe0a0) * 0.6f;
		const FVector Pts[6] = {FVector(100, 0, 0), FVector(-100, 0, 0), FVector(0, 100, 0), FVector(0, -100, 0), FVector(0, 0, 100), FVector(0, 0, -100)};
		const int32 Faces[8][3] = {{0, 2, 4}, {2, 1, 4}, {1, 3, 4}, {3, 0, 4}, {2, 0, 5}, {1, 2, 5}, {3, 1, 5}, {0, 3, 5}};
		for (const auto& F : Faces) M.Tri(Pts[F[0]], Pts[F[1]], Pts[F[2]], C);
		FLBMeshBuilder HaloMesh;
		FLinearColor HaloCol = LB::Hex(0xffc060) * 0.5f;
		HaloCol.A = 0.35f;
		HaloMesh.Sphere(FVector::ZeroVector, FVector(260.f), 16, 12, HaloCol);
		LanternGlow = NewObject<UProceduralMeshComponent>(this);
		LanternGlow->SetupAttachment(Core->Pivot);
		LanternGlow->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		LanternGlow->SetCastShadow(false);
		LanternGlow->RegisterComponent();
		M.Build(LanternGlow, 0, false, LBMaterials::Get(ELBMat::Unlit));
		if (LBMaterials::IsNative(ELBMat::Additive)) HaloMesh.Build(LanternGlow, 1, false, LBMaterials::Get(ELBMat::Additive));
	}
	if (Core) for (UProceduralMeshComponent* Mesh : Core->Meshes) if (Mesh) Mesh->SetVisibility(!bLit);
	if (Halo) Halo->SetVisible(false);
	if (LanternGlow) LanternGlow->SetVisibility(bLit);
	for (UPointLightComponent* L : Lights)
	{
		if (L && L->ComponentHasTag(TEXT("lanternLight"))) L->SetIntensity(bLit ? 40.f * 1.6f : 0.f);
	}
}

// =================================================================== Height & collision

float ALBArea::HeightAt(float X, float Z) const
{
	return Data ? Data->HeightAt(X, Z) : 0.f;
}

float ALBArea::GroundY(float X, float Z) const
{
	const float H = HeightAt(X, Z);
	return Data && Data->HasWater ? FMath::Max(H, Data->WaterLevel - 0.45f) : H;
}

bool ALBArea::InWater(float X, float Z) const
{
	return Data && Data->HasWater && HeightAt(X, Z) < Data->WaterLevel - 0.05f;
}

static void ResolveCircle(const TArray<FLBCollider>& Colliders, float& X, float& Z, float R, bool& bHit)
{
	for (int32 Iter = 0; Iter < 2; Iter++)
	{
		for (const FLBCollider& C : Colliders)
		{
			if (C.bDisabled) continue;
			if (C.bCircle)
			{
				const float Dx = X - C.X;
				const float Dz = Z - C.Z;
				const float Min = C.R + R;
				const float D2 = Dx * Dx + Dz * Dz;
				if (D2 < Min * Min)
				{
					float D = FMath::Sqrt(D2);
					if (D <= 0.f) D = 0.0001f;
					X = C.X + Dx / D * Min;
					Z = C.Z + Dz / D * Min;
					bHit = true;
				}
			}
			else
			{
				const float Cx = FMath::Clamp(X, C.MinX, C.MaxX);
				const float Cz = FMath::Clamp(Z, C.MinZ, C.MaxZ);
				const float Dx = X - Cx;
				const float Dz = Z - Cz;
				const float D2 = Dx * Dx + Dz * Dz;
				if (D2 < R * R)
				{
					bHit = true;
					if (D2 > 1e-8f)
					{
						const float D = FMath::Sqrt(D2);
						X = Cx + Dx / D * R;
						Z = Cz + Dz / D * R;
					}
					else
					{
						// Centre inside the box: push out along the axis of least penetration.
						const float Pl = X - C.MinX, Pr = C.MaxX - X, Pb = Z - C.MinZ, Pf = C.MaxZ - Z;
						const float M = FMath::Min(FMath::Min(Pl, Pr), FMath::Min(Pb, Pf));
						if (M == Pl) X = C.MinX - R;
						else if (M == Pr) X = C.MaxX + R;
						else if (M == Pb) Z = C.MinZ - R;
						else Z = C.MaxZ + R;
					}
				}
			}
		}
	}
}

FVector2D ALBArea::Move(float X, float Z, float Dx, float Dz, float Radius, bool* bOutBlocked) const
{
	bool bBlocked = false;
	float Nx = X + Dx;
	float Nz = Z + Dz;
	if (Data)
	{
		if (!Data->IsWalkable(Nx, Nz))
		{
			bBlocked = true;
			if (Data->IsWalkable(Nx, Z)) Nz = Z;
			else if (Data->IsWalkable(X, Nz)) Nx = X;
			else
			{
				Nx = X;
				Nz = Z;
			}
		}
		ResolveCircle(Colliders, Nx, Nz, Radius, bBlocked);
		if (!Data->IsWalkable(Nx, Nz) && Data->IsWalkable(X, Z))
		{
			Nx = X;
			Nz = Z;
		}
		const float Half = Data->Size / 2.f - 2.f;
		Nx = FMath::Clamp(Nx, -Half, Half);
		Nz = FMath::Clamp(Nz, -Half, Half);
	}
	if (bOutBlocked) *bOutBlocked = bBlocked;
	return FVector2D(Nx, Nz);
}

float ALBArea::CameraClearance(const FVector2D& From, const FVector2D& To) const
{
	float Best = 1.f;
	const int32 Steps = 16;
	for (const FLBCollider& C : Colliders)
	{
		if (C.bDisabled || C.H < 2.5f) continue;
		// Thin props (posts, trunks) should not yank the camera around.
		if (C.bCircle && C.R < 0.8f) continue;
		for (int32 I = 1; I <= Steps; I++)
		{
			const float T = float(I) / Steps;
			if (T >= Best) break;
			const float X = From.X + (To.X - From.X) * T;
			const float Z = From.Y + (To.Y - From.Y) * T;
			const bool bInside = C.bCircle ? FMath::Square(X - C.X) + FMath::Square(Z - C.Z) < C.R * C.R : (X > C.MinX && X < C.MaxX && Z > C.MinZ && Z < C.MaxZ);
			if (bInside)
			{
				Best = FMath::Max(0.f, T - 1.f / Steps);
				break;
			}
		}
	}
	if (Data && Data->Indoor)
	{
		const int32 WSteps = 20;
		for (int32 I = 1; I <= WSteps; I++)
		{
			const float F = float(I) / WSteps;
			if (F > Best) break;
			const float X = From.X + (To.X - From.X) * F;
			const float Z = From.Y + (To.Y - From.Y) * F;
			if (!Data->IsWalkable(X, Z))
			{
				Best = FMath::Max(0.05f, F - 1.5f / WSteps);
				break;
			}
		}
	}
	return Best;
}
