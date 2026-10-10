#include "LBMeshKit.h"
#include "ProceduralMeshComponent.h"
#include "Materials/Material.h"
#include "Materials/MaterialInterface.h"
#include "Engine/Engine.h"
#include "UObject/UObjectGlobals.h"
#include "UObject/Package.h"
#if WITH_EDITOR
#include "Materials/MaterialExpressionVertexColor.h"
#include "Materials/MaterialExpressionConstant.h"
#endif

void FLBMeshBuilder::Reset()
{
	Verts.Reset();
	Tris.Reset();
	Normals.Reset();
	Colors.Reset();
	UVs.Reset();
}

void FLBMeshBuilder::Tri(const FVector& A, const FVector& B, const FVector& C, const FLinearColor& Col)
{
	FVector N = FVector::CrossProduct(B - A, C - A);
	if (!N.Normalize()) N = FVector::UpVector;
	// Front copy
	int32 Base = Verts.Num();
	Verts.Append({A, B, C});
	Normals.Append({N, N, N});
	Colors.Append({Col, Col, Col});
	UVs.Append({FVector2D(0, 0), FVector2D(1, 0), FVector2D(0, 1)});
	Tris.Append({Base, Base + 1, Base + 2});
	// Back copy with opposite winding and normal.
	Base = Verts.Num();
	Verts.Append({A, C, B});
	Normals.Append({-N, -N, -N});
	Colors.Append({Col, Col, Col});
	UVs.Append({FVector2D(0, 0), FVector2D(0, 1), FVector2D(1, 0)});
	Tris.Append({Base, Base + 1, Base + 2});
}

void FLBMeshBuilder::Quad(const FVector& A, const FVector& B, const FVector& C, const FVector& D, const FLinearColor& Col)
{
	Tri(A, B, C, Col);
	Tri(A, C, D, Col);
}

void FLBMeshBuilder::Box(const FVector& Center, const FVector& Half, const FLinearColor& Col, float YawDeg)
{
	const FRotator R(0.f, YawDeg, 0.f);
	auto P = [&](float X, float Y, float Z) { return Center + R.RotateVector(FVector(X * Half.X, Y * Half.Y, Z * Half.Z)); };
	const FLinearColor Top = Col * 1.08f;
	const FLinearColor Side = Col * 0.92f;
	Quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), Top);
	Quad(P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), Col * 0.7f);
	Quad(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), Col);
	Quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), Side);
	Quad(P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), Side);
	Quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), Col);
}

void FLBMeshBuilder::Cylinder(const FVector& Base, float RadiusBottom, float RadiusTop, float Height, int32 Segments, const FLinearColor& Col, bool bCaps)
{
	Segments = FMath::Max(3, Segments);
	const FVector Top = Base + FVector(0, 0, Height);
	for (int32 I = 0; I < Segments; I++)
	{
		const float A0 = 2.f * PI * I / Segments;
		const float A1 = 2.f * PI * (I + 1) / Segments;
		const FVector D0(FMath::Cos(A0), FMath::Sin(A0), 0.f);
		const FVector D1(FMath::Cos(A1), FMath::Sin(A1), 0.f);
		const FLinearColor Shade = Col * (0.85f + 0.15f * FMath::Cos(A0 - 0.8f));
		if (RadiusTop > 0.01f) Quad(Base + D0 * RadiusBottom, Base + D1 * RadiusBottom, Top + D1 * RadiusTop, Top + D0 * RadiusTop, Shade);
		else Tri(Base + D0 * RadiusBottom, Base + D1 * RadiusBottom, Top, Shade);
		if (bCaps)
		{
			if (RadiusBottom > 0.01f) Tri(Base, Base + D1 * RadiusBottom, Base + D0 * RadiusBottom, Col * 0.7f);
			if (RadiusTop > 0.01f) Tri(Top, Top + D0 * RadiusTop, Top + D1 * RadiusTop, Col * 1.05f);
		}
	}
}

void FLBMeshBuilder::Sphere(const FVector& Center, const FVector& Radii, int32 Segments, int32 Rings, const FLinearColor& Col)
{
	Segments = FMath::Max(4, Segments);
	Rings = FMath::Max(3, Rings);
	auto P = [&](int32 S, int32 R) {
		const float Theta = PI * R / Rings;
		const float Phi = 2.f * PI * S / Segments;
		return Center + FVector(FMath::Sin(Theta) * FMath::Cos(Phi) * Radii.X, FMath::Sin(Theta) * FMath::Sin(Phi) * Radii.Y, FMath::Cos(Theta) * Radii.Z);
	};
	for (int32 R = 0; R < Rings; R++)
	{
		const FLinearColor Shade = Col * (1.05f - 0.25f * float(R) / Rings);
		for (int32 S = 0; S < Segments; S++)
		{
			Quad(P(S, R), P(S + 1, R), P(S + 1, R + 1), P(S, R + 1), Shade);
		}
	}
}

void FLBMeshBuilder::Sector(const FVector& Center, float InnerR, float OuterR, float StartDeg, float SweepDeg, int32 Segments, const FLinearColor& Col)
{
	Segments = FMath::Max(3, Segments);
	for (int32 I = 0; I < Segments; I++)
	{
		const float A0 = FMath::DegreesToRadians(StartDeg + SweepDeg * I / Segments);
		const float A1 = FMath::DegreesToRadians(StartDeg + SweepDeg * (I + 1) / Segments);
		const FVector D0(FMath::Cos(A0), FMath::Sin(A0), 0.f);
		const FVector D1(FMath::Cos(A1), FMath::Sin(A1), 0.f);
		if (InnerR > 0.01f) Quad(Center + D0 * InnerR, Center + D1 * InnerR, Center + D1 * OuterR, Center + D0 * OuterR, Col);
		else Tri(Center, Center + D1 * OuterR, Center + D0 * OuterR, Col);
	}
}

void FLBMeshBuilder::Limb(const FVector& A, const FVector& B, float R0, float R1, int32 Segments, const FLinearColor& Col)
{
	const FVector Axis = B - A;
	const float Len = Axis.Size();
	if (Len < KINDA_SMALL_NUMBER) return;
	const FQuat Q = FQuat::FindBetweenNormals(FVector::UpVector, Axis / Len);
	FLBMeshBuilder Local;
	Local.Cylinder(FVector::ZeroVector, R0, R1, Len, Segments, Col, true);
	for (FVector& V : Local.Verts) V = A + Q.RotateVector(V);
	for (FVector& N : Local.Normals) N = Q.RotateVector(N);
	Append(Local);
}

void FLBMeshBuilder::Append(const FLBMeshBuilder& Other)
{
	const int32 Offset = Verts.Num();
	Verts.Append(Other.Verts);
	Normals.Append(Other.Normals);
	Colors.Append(Other.Colors);
	UVs.Append(Other.UVs);
	Tris.Reserve(Tris.Num() + Other.Tris.Num());
	for (const int32 T : Other.Tris) Tris.Add(T + Offset);
}

void FLBMeshBuilder::Build(UProceduralMeshComponent* Mesh, int32 Section, bool bCollision, UMaterialInterface* Material) const
{
	if (!Mesh || IsEmpty()) return;
	TArray<FProcMeshTangent> Tangents;
	Mesh->CreateMeshSection_LinearColor(Section, Verts, Tris, Normals, UVs, Colors, Tangents, bCollision);
	if (Material) Mesh->SetMaterial(Section, Material);
}

// =================================================================== Materials

namespace LBMaterials
{
	static TWeakObjectPtr<UMaterialInterface> Cached;

	UMaterialInterface* VertexColor(UObject* Outer)
	{
		if (Cached.IsValid()) return Cached.Get();

		// 1) A project material, if the user created one (recommended for packaged builds).
		if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Lanternbound/M_VertexColor.M_VertexColor"), nullptr, LOAD_NoWarn | LOAD_Quiet))
		{
			Cached = M;
			return M;
		}

#if WITH_EDITOR
		// 2) In the editor, build a simple lit vertex-colour material in memory.
		{
			UMaterial* M = NewObject<UMaterial>(GetTransientPackage(), TEXT("LB_RuntimeVertexColor"), RF_Transient);
			UMaterialExpressionVertexColor* VC = NewObject<UMaterialExpressionVertexColor>(M);
			UMaterialExpressionConstant* Rough = NewObject<UMaterialExpressionConstant>(M);
			Rough->R = 0.85f;
			M->GetExpressionCollection().AddExpression(VC);
			M->GetExpressionCollection().AddExpression(Rough);
			M->GetEditorOnlyData()->BaseColor.Expression = VC;
			M->GetEditorOnlyData()->Roughness.Expression = Rough;
			M->PostEditChange();
			M->AddToRoot();
			Cached = M;
			return M;
		}
#else
		// 3) Engine fallback (unlit-looking but always available).
		UMaterialInterface* EngineMat = GEngine ? static_cast<UMaterialInterface*>(GEngine->VertexColorMaterial) : nullptr;
		Cached = EngineMat;
		return EngineMat;
#endif
	}
}
