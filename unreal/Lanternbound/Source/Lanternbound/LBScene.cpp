#include "LBScene.h"
#include "LBData.h"
#include "Lanternbound.h"
#include "ProceduralMeshComponent.h"
#include "Components/SceneComponent.h"
#include "GameFramework/Actor.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/ConfigCacheIni.h"

namespace
{
	struct FReader
	{
		const TArray<uint8>& B;
		int64 O = 0;
		bool bBad = false;

		explicit FReader(const TArray<uint8>& InB) : B(InB) {}

		bool Need(int64 N)
		{
			if (O + N > B.Num()) bBad = true;
			return !bBad;
		}
		uint8 U8()
		{
			if (!Need(1)) return 0;
			return B[O++];
		}
		int8 I8() { return int8(U8()); }
		uint16 U16()
		{
			if (!Need(2)) return 0;
			const uint16 V = uint16(B[O]) | (uint16(B[O + 1]) << 8);
			O += 2;
			return V;
		}
		uint32 U32()
		{
			if (!Need(4)) return 0;
			const uint32 V = uint32(B[O]) | (uint32(B[O + 1]) << 8) | (uint32(B[O + 2]) << 16) | (uint32(B[O + 3]) << 24);
			O += 4;
			return V;
		}
		float F32()
		{
			const uint32 V = U32();
			float F;
			FMemory::Memcpy(&F, &V, 4);
			return F;
		}
	};
}

bool LBScene::FlipWinding()
{
	static const bool bFlip = []() {
		bool b = false;
		if (GConfig) GConfig->GetBool(TEXT("Lanternbound"), TEXT("bFlipWinding"), b, GGameIni);
		return b;
	}();
	return bFlip;
}

bool LBScene::Load(const FString& FileName, TArray<FLBScenePart>& OutParts, FString& OutError)
{
	const FString Path = FPaths::Combine(ULBData::DataDir(), FileName);
	TArray<uint8> Bytes;
	if (!FFileHelper::LoadFileToArray(Bytes, *Path))
	{
		OutError = FString::Printf(TEXT("Missing mesh file: %s"), *Path);
		return false;
	}
	FReader R(Bytes);
	if (Bytes.Num() < 8 || Bytes[0] != 'L' || Bytes[1] != 'B' || Bytes[2] != 'M' || Bytes[3] != '1')
	{
		OutError = FString::Printf(TEXT("%s is not a Lanternbound mesh file"), *FileName);
		return false;
	}
	R.O = 4;
	const uint32 PartCount = R.U32();
	for (uint32 P = 0; P < PartCount && !R.bBad; P++)
	{
		FLBScenePart Part;
		const uint16 NameLen = R.U16();
		if (!R.Need(NameLen)) break;
		// Part names are plain ASCII identifiers.
		for (int32 C = 0; C < NameLen; C++) Part.Name.AppendChar(TCHAR(Bytes[R.O + C]));
		R.O += NameLen;
		Part.bVisible = R.U8() != 0;
		const float X = R.F32();
		const float Y = R.F32();
		const float Z = R.F32();
		Part.Location = FVector(X, Y, Z);
		Part.Yaw = R.F32();
		Part.Scale = R.F32();
		const uint32 SectionCount = R.U32();
		for (uint32 S = 0; S < SectionCount && !R.bBad; S++)
		{
			const uint8 KindByte = R.U8();
			const bool bInstanced = (KindByte & 0x80) != 0;
			FLBSceneSection Sec;
			Sec.Kind = ELBMat(FMath::Clamp(int32(KindByte & 0x7f), 0, int32(ELBMat::Count) - 1));
			Sec.bCastShadow = R.U8() != 0;
			const uint32 VertCount = R.U32();
			if (!R.Need(int64(VertCount) * 20)) break;
			TArray<FVector> TV;
			TArray<FVector> TN;
			TArray<FColor> TC;
			TV.Reserve(VertCount);
			TN.Reserve(VertCount);
			TC.Reserve(VertCount);
			for (uint32 V = 0; V < VertCount; V++)
			{
				const float VX = R.F32();
				const float VY = R.F32();
				const float VZ = R.F32();
				const float NX = R.I8() / 127.f;
				const float NY = R.I8() / 127.f;
				const float NZ = R.I8() / 127.f;
				R.U8();
				const uint8 CR = R.U8();
				const uint8 CG = R.U8();
				const uint8 CB = R.U8();
				const uint8 CA = R.U8();
				TV.Add(FVector(VX, VY, VZ));
				TN.Add(FVector(NX, NY, NZ).GetSafeNormal());
				TC.Add(FColor(CR, CG, CB, CA));
			}
			if (!bInstanced)
			{
				Sec.Verts = MoveTemp(TV);
				Sec.Normals = MoveTemp(TN);
				Sec.Colors = MoveTemp(TC);
			}
			else
			{
				const uint32 InstCount = R.U32();
				if (!R.Need(int64(InstCount) * 52)) break;
				Sec.Verts.Reserve(int64(InstCount) * VertCount);
				Sec.Normals.Reserve(int64(InstCount) * VertCount);
				Sec.Colors.Reserve(int64(InstCount) * VertCount);
				for (uint32 I = 0; I < InstCount; I++)
				{
					float M[12];
					for (float& F : M) F = R.F32();
					const uint8 TR = R.U8();
					const uint8 TG = R.U8();
					const uint8 TB = R.U8();
					R.U8();
					// Rows of the 3x3 linear part, then translation (all Unreal space).
					auto Xf = [&M](const FVector& P) {
						return FVector(M[0] * P.X + M[1] * P.Y + M[2] * P.Z + M[9], M[3] * P.X + M[4] * P.Y + M[5] * P.Z + M[10], M[6] * P.X + M[7] * P.Y + M[8] * P.Z + M[11]);
					};
					auto XfN = [&M](const FVector& N) {
						return FVector(M[0] * N.X + M[1] * N.Y + M[2] * N.Z, M[3] * N.X + M[4] * N.Y + M[5] * N.Z, M[6] * N.X + M[7] * N.Y + M[8] * N.Z).GetSafeNormal();
					};
					const float Det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
					const bool bMirror = Det < 0.f;
					for (uint32 T = 0; T + 2 < VertCount; T += 3)
					{
						const uint32 Order[3] = {T, bMirror ? T + 2 : T + 1, bMirror ? T + 1 : T + 2};
						for (const uint32 Idx : Order)
						{
							Sec.Verts.Add(Xf(TV[Idx]));
							Sec.Normals.Add(XfN(TN[Idx]));
							const FColor& C = TC[Idx];
							Sec.Colors.Add(FColor(uint8(C.R * TR / 255), uint8(C.G * TG / 255), uint8(C.B * TB / 255), C.A));
						}
					}
				}
			}
			if (Sec.Verts.Num() >= 3) Part.Sections.Add(MoveTemp(Sec));
		}
		OutParts.Add(MoveTemp(Part));
	}
	if (R.bBad)
	{
		OutError = FString::Printf(TEXT("%s is truncated or damaged"), *FileName);
		return false;
	}
	return true;
}

void FLBSpawnedPart::SetVisible(bool bVisible) const
{
	if (Pivot) Pivot->SetVisibility(bVisible, true);
}

static UProceduralMeshComponent* NewMesh(AActor* Owner, USceneComponent* Parent)
{
	UProceduralMeshComponent* M = NewObject<UProceduralMeshComponent>(Owner);
	M->SetupAttachment(Parent);
	M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	M->bUseAsyncCooking = true;
	M->RegisterComponent();
	return M;
}

static void BuildSections(UProceduralMeshComponent* Mesh, const TArray<const FLBSceneSection*>& Sections, const TArray<TArray<int32>>* TriLists)
{
	const bool bFlip = LBScene::FlipWinding();
	bool bAnyShadow = false;
	for (int32 S = 0; S < Sections.Num(); S++)
	{
		const FLBSceneSection& Sec = *Sections[S];
		TArray<FVector> V;
		TArray<FVector> N;
		TArray<FColor> C;
		TArray<int32> Tris;
		if (TriLists)
		{
			// Subset of triangles (tiling).
			const TArray<int32>& List = (*TriLists)[S];
			V.Reserve(List.Num() * 3);
			N.Reserve(List.Num() * 3);
			C.Reserve(List.Num() * 3);
			for (const int32 T : List)
			{
				for (int32 K = 0; K < 3; K++)
				{
					V.Add(Sec.Verts[T * 3 + K]);
					N.Add(Sec.Normals[T * 3 + K]);
					C.Add(Sec.Colors[T * 3 + K]);
				}
			}
		}
		else
		{
			V = Sec.Verts;
			N = Sec.Normals;
			C = Sec.Colors;
		}
		const int32 Count = V.Num() - V.Num() % 3;
		Tris.Reserve(Count);
		for (int32 I = 0; I < Count; I += 3)
		{
			Tris.Add(I);
			Tris.Add(bFlip ? I + 2 : I + 1);
			Tris.Add(bFlip ? I + 1 : I + 2);
		}
		if (Tris.Num() == 0) continue;
		const int32 Index = Mesh->GetNumSections();
		Mesh->CreateMeshSection(Index, V, Tris, N, TArray<FVector2D>(), C, TArray<FProcMeshTangent>(), false);
		Mesh->SetMaterial(Index, LBMaterials::Get(Sec.Kind));
		bAnyShadow |= Sec.bCastShadow;
		// Translucent / additive sections must not appear when no translucent material exists.
		if ((Sec.Kind == ELBMat::Translucent || Sec.Kind == ELBMat::Additive) && !LBMaterials::IsNative(Sec.Kind)) Mesh->SetMeshSectionVisible(Index, false);
	}
	Mesh->SetCastShadow(bAnyShadow);
}

FLBSpawnedPart LBScene::Spawn(AActor* Owner, USceneComponent* Parent, const FLBScenePart& Part, float TileSize)
{
	FLBSpawnedPart Out;
	Out.Name = Part.Name;
	Out.BaseLocation = Part.Location;
	Out.BaseYaw = Part.Yaw;
	Out.BaseScale = Part.Scale;
	USceneComponent* Pivot = NewObject<USceneComponent>(Owner);
	Pivot->SetupAttachment(Parent);
	Pivot->SetRelativeLocationAndRotation(Part.Location, FRotator(0.f, Part.Yaw, 0.f));
	Pivot->SetRelativeScale3D(FVector(Part.Scale));
	Pivot->RegisterComponent();
	Out.Pivot = Pivot;

	TArray<const FLBSceneSection*> All;
	for (const FLBSceneSection& S : Part.Sections) All.Add(&S);

	if (TileSize <= 0.f)
	{
		UProceduralMeshComponent* M = NewMesh(Owner, Pivot);
		BuildSections(M, All, nullptr);
		Out.Meshes.Add(M);
	}
	else
	{
		// Bucket triangles by centroid into square tiles.
		TMap<FIntPoint, TArray<TArray<int32>>> Tiles;
		for (int32 S = 0; S < All.Num(); S++)
		{
			const FLBSceneSection& Sec = *All[S];
			const int32 TriCount = Sec.Verts.Num() / 3;
			for (int32 T = 0; T < TriCount; T++)
			{
				const FVector C = (Sec.Verts[T * 3] + Sec.Verts[T * 3 + 1] + Sec.Verts[T * 3 + 2]) / 3.f;
				const FIntPoint Key(FMath::FloorToInt(C.X / TileSize), FMath::FloorToInt(C.Y / TileSize));
				TArray<TArray<int32>>& Lists = Tiles.FindOrAdd(Key);
				if (Lists.Num() == 0) Lists.SetNum(All.Num());
				Lists[S].Add(T);
			}
		}
		for (const TPair<FIntPoint, TArray<TArray<int32>>>& Tile : Tiles)
		{
			UProceduralMeshComponent* M = NewMesh(Owner, Pivot);
			BuildSections(M, All, &Tile.Value);
			Out.Meshes.Add(M);
		}
	}
	if (!Part.bVisible) Out.SetVisible(false);
	return Out;
}
