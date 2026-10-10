#include "LBVisual.h"
#include "LBMath.h"
#include "Components/PointLightComponent.h"

void ALBVisual::Place(float X, float Y, float Z, float Yaw)
{
	SetActorLocationAndRotation(LB::ToWorld(X, Z, Y), FRotator(0.f, LB::YawToUE(Yaw), 0.f));
}

UPointLightComponent* ALBVisual::AddLight(const FVector& Local, int32 Color, float Intensity, float RadiusCm)
{
	UPointLightComponent* L = NewObject<UPointLightComponent>(this);
	L->SetMobility(EComponentMobility::Movable);
	L->SetupAttachment(RootComponent);
	L->SetRelativeLocation(Local);
	L->SetIntensityUnits(ELightUnits::Candelas);
	L->SetIntensity(Intensity);
	L->SetLightColor(LB::Hex(Color));
	L->SetAttenuationRadius(RadiusCm);
	L->SetCastShadows(false);
	L->RegisterComponent();
	return L;
}
