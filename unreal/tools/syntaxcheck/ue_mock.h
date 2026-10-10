// Minimal stand-ins for the Unreal Engine API used by the Lanternbound port.
//
// This is NOT Unreal Engine. It lets `run.sh` compile every C++ file of the
// port with clang in syntax-only mode, which catches typos, missing members,
// wrong argument counts and mismatches between the port's own files without
// an engine install. The signatures here are written from the engine's
// documented API; a file passing this check can still fail to compile in the
// real engine if the engine's API differs.

#pragma once

#include <cstdint>
#include <cmath>
#include <cstring>
#include <cwchar>
#include <string>
#include <vector>
#include <functional>
#include <memory>
#include <algorithm>
#include <initializer_list>
#include <type_traits>
#include <utility>
#include <limits>

// ------------------------------------------------------------------ Macros

#define WITH_EDITOR 1
#define UCLASS(...)
#define USTRUCT(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define UENUM(...)
#define LANTERNBOUND_API
#define TEXT(x) L##x
#define check(x) ((void)0)
#define DECLARE_LOG_CATEGORY_EXTERN(Name, a, b) struct FLogCategory##Name {}; extern FLogCategory##Name Name;
#define DEFINE_LOG_CATEGORY(Name) FLogCategory##Name Name;
#define UE_LOG(Cat, Verb, Fmt, ...) ((void)(Cat), (void)FString::Printf(Fmt, ##__VA_ARGS__))
#define IMPLEMENT_PRIMARY_GAME_MODULE(Impl, Mod, Name) static Impl GModuleImpl_##Mod;
#define INDEFINITELY_LOOPING_DURATION 10000.f
#define UE_PI 3.14159265358979323846f
#define UE_KINDA_SMALL_NUMBER 1.e-4f
#define LogTemp LogTempCategory
struct FLogTempCategory {};
inline FLogTempCategory LogTemp;

using int8 = int8_t;
using int16 = int16_t;
using int32 = int32_t;
using int64 = int64_t;
using uint8 = uint8_t;
using uint16 = uint16_t;
using uint32 = uint32_t;
using uint64 = uint64_t;
using TCHAR = wchar_t;
using ANSICHAR = char;

template <typename T> T&& MoveTemp(T& V) { return static_cast<T&&>(V); }
template <typename T> T&& MoveTemp(T&& V) { return static_cast<T&&>(V); }

template <typename T> struct TNumericLimits
{
	static constexpr T Max() { return std::numeric_limits<T>::max(); }
	static constexpr T Lowest() { return std::numeric_limits<T>::lowest(); }
};

// ------------------------------------------------------------------ Containers

template <typename K, typename V> struct TPair
{
	K Key;
	V Value;
	TPair() = default;
	TPair(const K& InK, const V& InV) : Key(InK), Value(InV) {}
};

template <typename T> class TArray
{
public:
	std::vector<T> V;
	TArray() = default;
	TArray(std::initializer_list<T> L) : V(L) {}
	int32 Num() const { return int32(V.size()); }
	int32 Add(const T& X) { V.push_back(X); return Num() - 1; }
	int32 Add(T&& X) { V.push_back(std::move(X)); return Num() - 1; }
	T& Add_GetRef(const T& X) { V.push_back(X); return V.back(); }
	int32 AddUnique(const T& X) { for (int32 I = 0; I < Num(); I++) if (V[I] == X) return I; return Add(X); }
	void Append(const TArray& O) { V.insert(V.end(), O.V.begin(), O.V.end()); }
	void Append(std::initializer_list<T> L) { V.insert(V.end(), L.begin(), L.end()); }
	void Insert(const T& X, int32 I) { V.insert(V.begin() + I, X); }
	void RemoveAt(int32 I) { V.erase(V.begin() + I); }
	int32 Remove(const T& X) { int32 N = 0; for (int32 I = Num() - 1; I >= 0; I--) if (V[I] == X) { V.erase(V.begin() + I); N++; } return N; }
	template <typename P> int32 RemoveAll(P Pred) { int32 N = 0; for (int32 I = Num() - 1; I >= 0; I--) if (Pred(V[I])) { V.erase(V.begin() + I); N++; } return N; }
	void Reset() { V.clear(); }
	void Empty() { V.clear(); }
	void SetNum(int32 N) { V.resize(N); }
	void SetNumZeroed(int32 N) { V.assign(N, T()); }
	void SetNumUninitialized(int32 N) { V.resize(N); }
	void Reserve(int64 N) { V.reserve(size_t(N)); }
	bool IsValidIndex(int32 I) const { return I >= 0 && I < Num(); }
	T& Last() { return V.back(); }
	const T& Last() const { return V.back(); }
	T Pop() { T X = std::move(V.back()); V.pop_back(); return X; }
	bool Contains(const T& X) const { for (const T& E : V) if (E == X) return true; return false; }
	template <typename P> bool ContainsByPredicate(P Pred) const { for (const T& E : V) if (Pred(E)) return true; return false; }
	template <typename P> T* FindByPredicate(P Pred) { for (T& E : V) if (Pred(E)) return &E; return nullptr; }
	template <typename P> const T* FindByPredicate(P Pred) const { for (const T& E : V) if (Pred(E)) return &E; return nullptr; }
	template <typename P> int32 IndexOfByPredicate(P Pred) const { for (int32 I = 0; I < Num(); I++) if (Pred(V[I])) return I; return -1; }
	template <typename P> void Sort(P Pred)
	{
		if constexpr (std::is_pointer_v<T>) std::sort(V.begin(), V.end(), [&](T A, T B) { return Pred(*A, *B); });
		else std::sort(V.begin(), V.end(), Pred);
	}
	void Swap(int32 A, int32 B) { std::swap(V[A], V[B]); }
	T* GetData() { return V.data(); }
	const T* GetData() const { return V.data(); }
	T& operator[](int32 I) { return V[I]; }
	const T& operator[](int32 I) const { return V[I]; }
	auto begin() { return V.begin(); }
	auto end() { return V.end(); }
	auto begin() const { return V.begin(); }
	auto end() const { return V.end(); }
};

template <typename K, typename V> class TMap
{
public:
	std::vector<TPair<K, V>> E;
	TMap() = default;
	TMap(std::initializer_list<TPair<K, V>> L) : E(L) {}
	V& Add(const K& Key, const V& Val) { for (auto& P : E) if (P.Key == Key) { P.Value = Val; return P.Value; } E.push_back(TPair<K, V>(Key, Val)); return E.back().Value; }
	V& Add(const K& Key) { return Add(Key, V()); }
	V* Find(const K& Key) { for (auto& P : E) if (P.Key == Key) return &P.Value; return nullptr; }
	const V* Find(const K& Key) const { for (auto& P : E) if (P.Key == Key) return &P.Value; return nullptr; }
	V FindRef(const K& Key) const { const V* F = Find(Key); return F ? *F : V(); }
	V& FindOrAdd(const K& Key) { if (V* F = Find(Key)) return *F; return Add(Key, V()); }
	bool Contains(const K& Key) const { return Find(Key) != nullptr; }
	int32 Remove(const K& Key) { int32 N = 0; for (size_t I = E.size(); I-- > 0;) if (E[I].Key == Key) { E.erase(E.begin() + I); N++; } return N; }
	int32 Num() const { return int32(E.size()); }
	void Reset() { E.clear(); }
	V& operator[](const K& Key) { return *Find(Key); }
	const V& operator[](const K& Key) const { return *Find(Key); }
	auto begin() { return E.begin(); }
	auto end() { return E.end(); }
	auto begin() const { return E.begin(); }
	auto end() const { return E.end(); }
};

template <typename T> class TSet
{
public:
	std::vector<T> V;
	TSet() = default;
	TSet(std::initializer_list<T> L) : V(L) {}
	void Add(const T& X) { if (!Contains(X)) V.push_back(X); }
	bool Contains(const T& X) const { for (const T& E : V) if (E == X) return true; return false; }
	void Reset() { V.clear(); }
	int32 Num() const { return int32(V.size()); }
};

template <typename Sig> using TFunction = std::function<Sig>;
template <typename T> class TUniquePtr
{
	std::unique_ptr<T> P;
public:
	TUniquePtr() = default;
	TUniquePtr(std::nullptr_t) {}
	explicit TUniquePtr(T* In) : P(In) {}
	template <typename U> TUniquePtr(TUniquePtr<U>&& O) : P(O.Release()) {}
	TUniquePtr(TUniquePtr&&) = default;
	TUniquePtr& operator=(TUniquePtr&&) = default;
	T* Get() const { return P.get(); }
	T* Release() { return P.release(); }
	void Reset(T* In = nullptr) { P.reset(In); }
	T* operator->() const { return P.get(); }
	T& operator*() const { return *P; }
	explicit operator bool() const { return P != nullptr; }
	bool IsValid() const { return P != nullptr; }
};
template <typename T, typename... A> TUniquePtr<T> MakeUnique(A&&... Args) { return TUniquePtr<T>(new T(std::forward<A>(Args)...)); }
template <typename T> class TSharedPtr : public std::shared_ptr<T>
{
public:
	using std::shared_ptr<T>::shared_ptr;
	TSharedPtr() = default;
	TSharedPtr(const std::shared_ptr<T>& P) : std::shared_ptr<T>(P) {}
	bool IsValid() const { return this->get() != nullptr; }
	T* Get() const { return this->get(); }
};
template <typename T, typename... A> TSharedPtr<T> MakeShared(A&&... Args) { return TSharedPtr<T>(std::make_shared<T>(std::forward<A>(Args)...)); }

// ------------------------------------------------------------------ Strings

enum class ESearchCase { CaseSensitive, IgnoreCase };
enum class ESearchDir { FromStart, FromEnd };

class FString
{
public:
	std::wstring S;
	FString() = default;
	FString(const TCHAR* C) : S(C ? C : L"") {}
	FString(int32 Len, const TCHAR* C) : S(C, size_t(Len)) {}
	FString(const std::wstring& W) : S(W) {}
	const TCHAR* operator*() const { return S.c_str(); }
	bool IsEmpty() const { return S.empty(); }
	int32 Len() const { return int32(S.size()); }
	TCHAR operator[](int32 I) const { return S[size_t(I)]; }
	FString Mid(int32 Start, int32 Count = 1 << 30) const { return FString(S.substr(size_t(Start), size_t(Count))); }
	FString Left(int32 N) const { return FString(S.substr(0, size_t(N))); }
	FString LeftChop(int32 N) const { return Left(std::max(0, Len() - N)); }
	FString Right(int32 N) const { return Mid(std::max(0, Len() - N)); }
	bool StartsWith(const FString& P) const { return S.rfind(P.S, 0) == 0; }
	bool EndsWith(const FString& P) const { return S.size() >= P.S.size() && S.compare(S.size() - P.S.size(), P.S.size(), P.S) == 0; }
	int32 Find(const TCHAR* Sub, ESearchCase = ESearchCase::IgnoreCase, ESearchDir = ESearchDir::FromStart, int32 Start = -1) const { auto P = S.find(Sub, Start < 0 ? 0 : size_t(Start)); return P == std::wstring::npos ? -1 : int32(P); }
	FString Replace(const TCHAR* From, const TCHAR* To) const { return *this; }
	int32 ParseIntoArray(TArray<FString>& Out, const TCHAR* Delim, bool bCullEmpty = true) const { return 0; }
	int32 ParseIntoArrayWS(TArray<FString>& Out) const { return 0; }
	bool IsNumeric() const { return true; }
	bool Split(const FString& InS, FString* LeftS, FString* RightS, ESearchCase = ESearchCase::IgnoreCase, ESearchDir = ESearchDir::FromStart) const { return false; }
	FString ToUpper() const { return *this; }
	void AppendChar(TCHAR C) { S.push_back(C); }
	bool RemoveFromStart(const FString& P) { if (StartsWith(P)) { S.erase(0, P.S.size()); return true; } return false; }
	void Empty() { S.clear(); }
	FString& operator+=(const FString& O) { S += O.S; return *this; }
	FString& operator+=(const TCHAR* O) { S += O; return *this; }
	friend FString operator+(const FString& A, const FString& B) { return FString(A.S + B.S); }
	friend FString operator+(const FString& A, const TCHAR* B) { return FString(A.S + B); }
	friend FString operator+(const TCHAR* A, const FString& B) { return FString(std::wstring(A) + B.S); }
	bool operator==(const FString& O) const { return S == O.S; }
	bool operator!=(const FString& O) const { return S != O.S; }
	bool operator==(const TCHAR* O) const { return S == O; }
	bool operator!=(const TCHAR* O) const { return S != O; }
	bool operator<(const FString& O) const { return S < O.S; }

	template <typename... A> static FString Printf(const TCHAR* Fmt, A&&... Args)
	{
		// Catch the classic bug of passing an FString where %s needs a TCHAR*.
		static_assert(!(std::is_same_v<std::decay_t<A>, FString> || ...), "Pass *String (TCHAR*) to FString::Printf, not FString");
		return FString(Fmt);
	}
	static FString FromInt(int32 V) { return FString(std::to_wstring(V)); }
	static FString Join(const TArray<FString>& Parts, const TCHAR* Sep) { return FString(); }
};
inline bool operator==(const TCHAR* A, const FString& B) { return B == A; }

class FName
{
public:
	FString N;
	FName() = default;
	FName(const TCHAR* C) : N(C) {}
	FString ToString() const { return N; }
	bool operator==(const FName& O) const { return N == O.N; }
};
inline const FName NAME_None;

struct FCString
{
	static int32 Atoi(const TCHAR* S) { return int32(wcstol(S, nullptr, 10)); }
};

class FUTF8ToTCHAR
{
public:
	FUTF8ToTCHAR(const ANSICHAR*, int32) {}
	int32 Length() const { return 0; }
	const TCHAR* Get() const { return L""; }
};

// ------------------------------------------------------------------ Math

struct FMath
{
	template <typename T> static T Min(T A, T B) { return A < B ? A : B; }
	template <typename T> static T Max(T A, T B) { return A > B ? A : B; }
	template <typename T> static T Clamp(T V, T A, T B) { return V < A ? A : V > B ? B : V; }
	template <typename T> static T Abs(T V) { return V < 0 ? -V : V; }
	template <typename T> static T Square(T V) { return V * V; }
	template <typename T> static T Sign(T V) { return V > 0 ? T(1) : V < 0 ? T(-1) : T(0); }
	template <typename T, typename U> static T Lerp(const T& A, const T& B, const U& Alpha) { return A + (B - A) * Alpha; }
	static float Sin(float V) { return std::sin(V); }
	static float Cos(float V) { return std::cos(V); }
	static float Tan(float V) { return std::tan(V); }
	static float Acos(float V) { return std::acos(V); }
	static float Atan2(float Y, float X) { return std::atan2(Y, X); }
	static float Sqrt(float V) { return std::sqrt(V); }
	static float Exp(float V) { return std::exp(V); }
	static float Pow(float A, float B) { return std::pow(A, B); }
	static float Tanh(float V) { return std::tanh(V); }
	static int32 FloorToInt(float V) { return int32(std::floor(V)); }
	static int32 CeilToInt(float V) { return int32(std::ceil(V)); }
	static int32 RoundToInt(float V) { return int32(std::round(V)); }
	static float RoundToFloat(float V) { return std::round(V); }
	static float FloorToFloat(float V) { return std::floor(V); }
	static double FloorToDouble(double V) { return std::floor(V); }
	static float DegreesToRadians(float V) { return V * UE_PI / 180.f; }
	static float RadiansToDegrees(float V) { return V * 180.f / UE_PI; }
	static bool IsFinite(float V) { return std::isfinite(V); }
	static float SmoothStep(float A, float B, float X) { return X; }
	static float FInterpTo(float C, float T, float Dt, float S) { return T; }
	static float FInterpConstantTo(float C, float T, float Dt, float S) { return T; }
	static float FindDeltaAngleDegrees(float A, float B) { return B - A; }
	static int32 RandRange(int32 A, int32 B) { return A; }
	template <typename V> static V VInterpTo(const V& C, const V& T, float Dt, float S) { return T; }
};

struct FRotator;
struct FVector
{
	double X = 0, Y = 0, Z = 0;
	FVector() = default;
	FVector(double InX, double InY, double InZ) : X(InX), Y(InY), Z(InZ) {}
	explicit FVector(double F) : X(F), Y(F), Z(F) {}
	FVector operator+(const FVector& O) const { return {X + O.X, Y + O.Y, Z + O.Z}; }
	FVector operator-(const FVector& O) const { return {X - O.X, Y - O.Y, Z - O.Z}; }
	FVector operator-() const { return {-X, -Y, -Z}; }
	FVector operator*(double S) const { return {X * S, Y * S, Z * S}; }
	FVector operator/(double S) const { return {X / S, Y / S, Z / S}; }
	FVector& operator+=(const FVector& O) { X += O.X; Y += O.Y; Z += O.Z; return *this; }
	FVector& operator*=(double S) { X *= S; Y *= S; Z *= S; return *this; }
	bool operator==(const FVector& O) const { return X == O.X && Y == O.Y && Z == O.Z; }
	double Size() const { return std::sqrt(X * X + Y * Y + Z * Z); }
	double SizeSquared() const { return X * X + Y * Y + Z * Z; }
	FVector GetSafeNormal() const { return *this; }
	bool Normalize() { return true; }
	FRotator Rotation() const;
	static double Dist(const FVector& A, const FVector& B) { return (A - B).Size(); }
	static double Dist2D(const FVector& A, const FVector& B) { return 0; }
	static FVector CrossProduct(const FVector& A, const FVector& B) { return {}; }
	static double DotProduct(const FVector& A, const FVector& B) { return 0; }
	static const FVector ZeroVector;
	static const FVector UpVector;
};
inline FVector operator*(double S, const FVector& V) { return V * S; }
inline const FVector FVector::ZeroVector{0, 0, 0};
inline const FVector FVector::UpVector{0, 0, 1};

struct FVector2D
{
	double X = 0, Y = 0;
	FVector2D() = default;
	FVector2D(double InX, double InY) : X(InX), Y(InY) {}
	FVector2D operator+(const FVector2D& O) const { return {X + O.X, Y + O.Y}; }
	FVector2D operator-(const FVector2D& O) const { return {X - O.X, Y - O.Y}; }
	FVector2D operator*(double S) const { return {X * S, Y * S}; }
	bool operator==(const FVector2D& O) const { return X == O.X && Y == O.Y; }
	bool operator!=(const FVector2D& O) const { return !(*this == O); }
	double Size() const { return std::sqrt(X * X + Y * Y); }
	static const FVector2D ZeroVector;
};
inline const FVector2D FVector2D::ZeroVector{0, 0};

struct FIntPoint
{
	int32 X = 0, Y = 0;
	FIntPoint() = default;
	FIntPoint(int32 InX, int32 InY) : X(InX), Y(InY) {}
	bool operator==(const FIntPoint& O) const { return X == O.X && Y == O.Y; }
};

struct FBox2D
{
	FVector2D Min, Max;
	FBox2D() = default;
	FBox2D(const FVector2D& A, const FVector2D& B) : Min(A), Max(B) {}
	bool IsInside(const FVector2D& P) const { return P.X > Min.X && P.X < Max.X && P.Y > Min.Y && P.Y < Max.Y; }
};

struct FRotator
{
	double Pitch = 0, Yaw = 0, Roll = 0;
	FRotator() = default;
	FRotator(double P, double Y, double R) : Pitch(P), Yaw(Y), Roll(R) {}
	FRotator operator+(const FRotator& O) const { return {Pitch + O.Pitch, Yaw + O.Yaw, Roll + O.Roll}; }
	FVector RotateVector(const FVector& V) const { return V; }
	static const FRotator ZeroRotator;
};
inline const FRotator FRotator::ZeroRotator{0, 0, 0};
inline FRotator FVector::Rotation() const { return {}; }

namespace EAxis { enum Type { X, Y, Z }; }
struct FRotationMatrix
{
	explicit FRotationMatrix(const FRotator&) {}
	FVector GetScaledAxis(EAxis::Type) const { return {}; }
	static FRotationMatrix MakeFromX(const FVector&) { return FRotationMatrix(FRotator()); }
	FRotator Rotator() const { return {}; }
};

struct FQuat
{
	static FQuat FindBetweenNormals(const FVector&, const FVector&) { return {}; }
	FVector RotateVector(const FVector& V) const { return V; }
};

struct FTransform
{
	FVector TransformPosition(const FVector& V) const { return V; }
	static const FTransform Identity;
};
inline const FTransform FTransform::Identity{};

struct FColor
{
	uint8 R = 0, G = 0, B = 0, A = 255;
	FColor() = default;
	FColor(uint8 InR, uint8 InG, uint8 InB, uint8 InA = 255) : R(InR), G(InG), B(InB), A(InA) {}
};

struct FLinearColor
{
	float R = 0, G = 0, B = 0, A = 1;
	FLinearColor() = default;
	FLinearColor(float InR, float InG, float InB, float InA = 1.f) : R(InR), G(InG), B(InB), A(InA) {}
	explicit FLinearColor(const FColor& C) : R(C.R / 255.f), G(C.G / 255.f), B(C.B / 255.f), A(C.A / 255.f) {}
	FLinearColor operator*(float S) const { return {R * S, G * S, B * S, A * S}; }
	FLinearColor operator*(const FLinearColor& O) const { return {R * O.R, G * O.G, B * O.B, A * O.A}; }
	FLinearColor operator+(const FLinearColor& O) const { return {R + O.R, G + O.G, B + O.B, A + O.A}; }
	FLinearColor operator-(const FLinearColor& O) const { return {R - O.R, G - O.G, B - O.B, A - O.A}; }
	FColor ToFColor(bool bSRGB) const { return {}; }
	static const FLinearColor White, Black, Gray, Yellow;
};
inline const FLinearColor FLinearColor::White{1, 1, 1, 1};
inline const FLinearColor FLinearColor::Black{0, 0, 0, 1};
inline const FLinearColor FLinearColor::Gray{0.5f, 0.5f, 0.5f, 1};
inline const FLinearColor FLinearColor::Yellow{1, 1, 0, 1};

struct FRandomStream
{
	FRandomStream() = default;
	explicit FRandomStream(int32 Seed) {}
	void Initialize(int32 Seed) {}
	float FRand() const { return 0.5f; }
	int32 RandRange(int32 A, int32 B) const { return A; }
};

struct FDateTime
{
	static FDateTime Now() { return {}; }
	static FDateTime UtcNow() { return {}; }
	static FDateTime FromUnixTimestamp(int64) { return {}; }
	int64 GetTicks() const { return 0; }
	int64 ToUnixTimestamp() const { return 0; }
	FString ToString(const TCHAR*) const { return {}; }
};

struct FPlatformTime { static double Seconds() { return 0; } };
struct FMemory { static void* Memcpy(void* D, const void* S, size_t N) { return std::memcpy(D, S, N); } };

// ------------------------------------------------------------------ UObject

using EObjectFlags = uint32;
constexpr EObjectFlags RF_NoFlags = 0, RF_Transient = 1, RF_Public = 2, RF_Standalone = 4;
constexpr uint32 LOAD_NoWarn = 1, LOAD_Quiet = 2;

class UClass {};
class UWorld;
class UObject
{
public:
	virtual ~UObject() = default;
	virtual UWorld* GetWorld() const { return nullptr; }
	static UClass* StaticClass() { return nullptr; }
	void AddToRoot() {}
	void MarkPackageDirty() {}
};
inline bool IsValid(const UObject* O) { return O != nullptr; }
template <typename T> T* NewObject(UObject* Outer = nullptr, FName Name = FName(), EObjectFlags Flags = RF_NoFlags) { return new T(); }
template <typename T> T* NewObject(UObject* Outer, UClass* Class, FName Name = FName(), EObjectFlags Flags = RF_NoFlags) { return new T(); }
template <typename T, typename U> T* Cast(U* O) { return dynamic_cast<T*>(O); }
template <typename T> T* LoadObject(UObject* Outer, const TCHAR* Path, const TCHAR* File = nullptr, uint32 Flags = 0, void* Sandbox = nullptr) { return nullptr; }
class UPackage : public UObject
{
public:
	void FullyLoad() {}
	static bool SavePackage(UPackage*, UObject*, const TCHAR*, const struct FSavePackageArgs&) { return true; }
};
inline UPackage* GetTransientPackage() { return nullptr; }
inline UPackage* CreatePackage(const TCHAR*) { return nullptr; }
inline FName MakeUniqueObjectName(UObject*, UClass*, FName Base) { return Base; }
struct FSavePackageArgs { EObjectFlags TopLevelFlags = 0; };
struct FPackageName
{
	static FString LongPackageNameToFilename(const FString& P, const FString& Ext) { return P; }
	static FString GetAssetPackageExtension() { return TEXT(".uasset"); }
};
template <typename T> class TWeakObjectPtr
{
	T* P = nullptr;
public:
	TWeakObjectPtr() = default;
	TWeakObjectPtr(T* In) : P(In) {}
	TWeakObjectPtr& operator=(T* In) { P = In; return *this; }
	bool IsValid() const { return P != nullptr; }
	T* Get() const { return P; }
};
template <typename T> class TSubclassOf
{
public:
	TSubclassOf() = default;
	TSubclassOf(UClass*) {}
	TSubclassOf(std::nullptr_t) {}
};

// ------------------------------------------------------------------ Misc engine utilities

struct FPaths
{
	static FString ProjectContentDir() { return {}; }
	template <typename... A> static FString Combine(A&&...) { return {}; }
};
struct FFileHelper
{
	static bool LoadFileToString(FString& Out, const TCHAR* Path) { return true; }
	static bool LoadFileToArray(TArray<uint8>& Out, const TCHAR* Path) { return true; }
};
struct FJsonObjectConverter
{
	template <typename T> static bool JsonObjectStringToUStruct(const FString& Json, T* Out, int64 CheckFlags = 0, int64 SkipFlags = 0) { return true; }
};
class FConfigCacheIni
{
public:
	bool GetBool(const TCHAR* Section, const TCHAR* Key, bool& Value, const FString& File) { return false; }
};
inline FConfigCacheIni* GConfig = nullptr;
inline FString GGameIni;
inline bool GIsEditor = false;

struct FConsoleCommandDelegate
{
	template <typename F> static FConsoleCommandDelegate CreateLambda(F&&) { return {}; }
};
struct FAutoConsoleCommand
{
	FAutoConsoleCommand(const TCHAR*, const TCHAR*, const FConsoleCommandDelegate&) {}
};

class IModuleInterface { public: virtual ~IModuleInterface() = default; };
class FDefaultGameModuleImpl : public IModuleInterface {};

// ------------------------------------------------------------------ Actors and components

namespace EComponentMobility { enum Type { Static, Stationary, Movable }; }
namespace ECollisionEnabled { enum Type { NoCollision, QueryOnly, QueryAndPhysics }; }
enum class ELightUnits : uint8 { Unitless, Candelas, Lumens };
enum class ESkyLightSourceType : uint8 { SLS_CapturedScene, SLS_SpecifiedCubemap };
namespace EEndPlayReason { enum Type { Destroyed, LevelTransition, EndPlayInEditor, RemovedFromWorld, Quit }; }
enum class ESpawnActorCollisionHandlingMethod : uint8 { Undefined, AlwaysSpawn };
enum ETickingGroup { TG_PrePhysics, TG_PostPhysics };

struct FAttachmentTransformRules
{
	static const FAttachmentTransformRules KeepRelativeTransform;
};
inline const FAttachmentTransformRules FAttachmentTransformRules::KeepRelativeTransform{};

class AActor;
class UMaterialInterface;

class UActorComponent : public UObject
{
public:
	TArray<FName> ComponentTags;
	void RegisterComponent() {}
	void DestroyComponent() {}
	bool ComponentHasTag(FName) const { return false; }
	AActor* GetOwner() const { return nullptr; }
};

class USceneComponent : public UActorComponent
{
public:
	void SetupAttachment(USceneComponent*) {}
	bool AttachToComponent(USceneComponent*, const FAttachmentTransformRules&) { return true; }
	void SetRelativeLocation(const FVector&) {}
	void SetRelativeRotation(const FRotator&) {}
	void SetRelativeScale3D(const FVector&) {}
	void SetRelativeLocationAndRotation(const FVector&, const FRotator&) {}
	FVector GetRelativeLocation() const { return {}; }
	FRotator GetRelativeRotation() const { return {}; }
	void SetWorldLocation(const FVector&) {}
	void SetWorldRotation(const FRotator&) {}
	void SetWorldLocationAndRotation(const FVector&, const FRotator&) {}
	void SetVisibility(bool, bool bPropagate = false) {}
	FTransform GetComponentTransform() const { return {}; }
	void SetUsingAbsoluteRotation(bool) {}
	void SetMobility(EComponentMobility::Type) {}
};

class UPrimitiveComponent : public USceneComponent
{
public:
	uint32 bAffectDistanceFieldLighting = 1;
	void SetCollisionEnabled(ECollisionEnabled::Type) {}
	void SetCastShadow(bool) {}
	void SetMaterial(int32, UMaterialInterface*) {}
	UMaterialInterface* GetMaterial(int32) const { return nullptr; }
};

struct FProcMeshTangent {};
class UProceduralMeshComponent : public UPrimitiveComponent
{
public:
	bool bUseAsyncCooking = false;
	void CreateMeshSection(int32, const TArray<FVector>&, const TArray<int32>&, const TArray<FVector>&, const TArray<FVector2D>&, const TArray<FColor>&, const TArray<FProcMeshTangent>&, bool) {}
	void CreateMeshSection_LinearColor(int32, const TArray<FVector>&, const TArray<int32>&, const TArray<FVector>&, const TArray<FVector2D>&, const TArray<FLinearColor>&, const TArray<FProcMeshTangent>&, bool, bool bSRGBConversion = false) {}
	void ClearAllMeshSections() {}
	void SetMeshSectionVisible(int32, bool) {}
	int32 GetNumSections() const { return 0; }
};

class ULightComponent : public USceneComponent
{
public:
	void SetIntensity(float) {}
	void SetLightColor(FLinearColor, bool bSRGB = true) {}
	void SetCastShadows(bool) {}
};
class ULocalLightComponent : public ULightComponent
{
public:
	void SetAttenuationRadius(float) {}
	void SetIntensityUnits(ELightUnits) {}
};
class UPointLightComponent : public ULocalLightComponent {};
class UDirectionalLightComponent : public ULightComponent
{
public:
	void SetAtmosphereSunLight(bool) {}
};
class USkyLightComponent : public USceneComponent
{
public:
	ESkyLightSourceType SourceType = ESkyLightSourceType::SLS_CapturedScene;
	uint32 bLowerHemisphereIsBlack = 1;
	void SetLowerHemisphereColor(const FLinearColor&) {}
	void SetIntensity(float) {}
	void RecaptureSky() {}
};
class UExponentialHeightFogComponent : public USceneComponent
{
public:
	void SetFogDensity(float) {}
	void SetFogHeightFalloff(float) {}
	void SetStartDistance(float) {}
	void SetFogInscatteringColor(FLinearColor) {}
	void SetFogMaxOpacity(float) {}
	void SetFogCutoffDistance(float) {}
};

struct FActorTickFunction
{
	bool bCanEverTick = false;
	bool bTickEvenWhenPaused = false;
	ETickingGroup TickGroup = TG_PrePhysics;
};

class AActor : public UObject
{
public:
	FActorTickFunction PrimaryActorTick;
	USceneComponent* RootComponent = nullptr;
	USceneComponent* GetRootComponent() const { return RootComponent; }
	template <typename T> T* CreateDefaultSubobject(const TCHAR*) { return new T(); }
	virtual void BeginPlay() {}
	virtual void EndPlay(const EEndPlayReason::Type) {}
	virtual void Tick(float) {}
	bool SetActorLocation(const FVector&) { return true; }
	bool SetActorLocationAndRotation(const FVector&, const FRotator&) { return true; }
	FRotator GetActorRotation() const { return {}; }
	void AddActorWorldOffset(const FVector&) {}
	void AddActorLocalRotation(const FRotator&) {}
	void SetActorScale3D(const FVector&) {}
	void SetActorHiddenInGame(bool) {}
	bool Destroy() { return true; }
	void AddTickPrerequisiteActor(AActor*) {}
};

struct FActorSpawnParameters
{
	ESpawnActorCollisionHandlingMethod SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::Undefined;
};

class APlayerController;
class AGameModeBase;
class UGameInstance;
class UWorld : public UObject
{
public:
	bool bIsTearingDown = false;
	template <typename T> T* SpawnActor(UClass*, const FTransform&, const FActorSpawnParameters& = FActorSpawnParameters()) { return new T(); }
	APlayerController* GetFirstPlayerController() const { return nullptr; }
	UGameInstance* GetGameInstance() const { return nullptr; }
	AGameModeBase* GetAuthGameMode() const { return nullptr; }
	float GetDeltaSeconds() const { return 0.f; }
};

struct FWorldContext
{
	UWorld* World() const { return nullptr; }
};

class FSubsystemCollectionBase {};
class UGameInstanceSubsystem : public UObject
{
public:
	virtual void Initialize(FSubsystemCollectionBase&) {}
};
class UGameInstance : public UObject
{
public:
	virtual void Init() {}
	template <typename T> T* GetSubsystem() const { return nullptr; }
};

namespace EWindowMode { enum Type { Fullscreen, WindowedFullscreen, Windowed }; }
class UGameUserSettings : public UObject
{
public:
	void SetOverallScalabilityLevel(int32) {}
	EWindowMode::Type GetFullscreenMode() const { return EWindowMode::Windowed; }
	void SetFullscreenMode(EWindowMode::Type) {}
	void ApplySettings(bool) {}
	void ApplyNonResolutionSettings() {}
};

class UFont : public UObject {};
class UMaterial;
class UEngine : public UObject
{
public:
	UMaterial* VertexColorMaterial = nullptr;
	UGameUserSettings* GetGameUserSettings() { return nullptr; }
	const TArray<FWorldContext>& GetWorldContexts() const { static TArray<FWorldContext> C; return C; }
	UFont* GetMediumFont() const { return nullptr; }
	UFont* GetLargeFont() const { return nullptr; }
};
inline UEngine* GEngine = nullptr;

// ------------------------------------------------------------------ Input & player

class FKey
{
public:
	FName Name;
	FKey() = default;
	FKey(FName N) : Name(N) {}
	bool IsValid() const { return true; }
	bool IsAxis1D() const { return false; }
	bool IsAxis2D() const { return false; }
	bool IsAxis3D() const { return false; }
	bool IsTouch() const { return false; }
	bool IsGesture() const { return false; }
	bool IsGamepadKey() const { return false; }
	FName GetFName() const { return Name; }
	bool operator==(const FKey& O) const { return Name == O.Name; }
};

struct EKeys
{
	static const FKey A, D, E, S, W, AnyKey, BackSpace, Down, Up, Left, Right, Enter, Escape, Tab, SpaceBar, LeftShift, PageUp, PageDown;
	static const FKey One, Two, Three, Four, Five, Six, Seven, Eight, Nine;
	static const FKey LeftMouseButton, MouseScrollUp, MouseScrollDown, MouseX, MouseY;
	static const FKey Gamepad_DPad_Down, Gamepad_DPad_Left, Gamepad_DPad_Right, Gamepad_DPad_Up, Gamepad_FaceButton_Bottom, Gamepad_FaceButton_Right;
	static const FKey Gamepad_LeftShoulder, Gamepad_RightShoulder, Gamepad_LeftTrigger, Gamepad_RightTrigger, Gamepad_LeftTriggerAxis, Gamepad_RightTriggerAxis;
	static const FKey Gamepad_LeftX, Gamepad_LeftY, Gamepad_RightX, Gamepad_RightY, Gamepad_Special_Right;
	static void GetAllKeys(TArray<FKey>&) {}
};

enum class EMouseLockMode : uint8 { DoNotLock, LockOnCapture, LockAlways };
struct FInputModeGameAndUI
{
	FInputModeGameAndUI& SetLockMouseToViewportBehavior(EMouseLockMode) { return *this; }
	FInputModeGameAndUI& SetHideCursorDuringCapture(bool) { return *this; }
};
struct FInputModeGameOnly {};

class AController : public AActor {};
class APlayerController : public AController
{
public:
	bool bShowMouseCursor = false;
	bool bEnableClickEvents = false;
	bool bShouldPerformFullTickWhenPaused = false;
	bool bAutoManageActiveCameraTarget = true;
	virtual void PlayerTick(float) {}
	void SetInputMode(const FInputModeGameAndUI&) {}
	void SetInputMode(const FInputModeGameOnly&) {}
	bool IsInputKeyDown(const FKey&) const { return false; }
	bool WasInputKeyJustPressed(const FKey&) const { return false; }
	float GetInputAnalogKeyState(const FKey&) const { return 0.f; }
	void GetInputMouseDelta(float& X, float& Y) const {}
	bool GetMousePosition(float& X, float& Y) const { return false; }
	void SetViewTarget(AActor*) {}
	bool ProjectWorldLocationToScreen(FVector, FVector2D&, bool = false) const { return false; }
};

class AGameModeBase : public AActor
{
public:
	TSubclassOf<APlayerController> PlayerControllerClass;
	TSubclassOf<AActor> HUDClass;
	TSubclassOf<AActor> DefaultPawnClass;
	TSubclassOf<AActor> SpectatorClass;
	virtual void PostLogin(APlayerController*) {}
	virtual void RestartPlayer(AController*) {}
};

class UCanvas : public UObject
{
public:
	float ClipX = 1920.f, ClipY = 1080.f;
};
class AHUD : public AActor
{
public:
	UCanvas* Canvas = nullptr;
	APlayerController* PlayerOwner = nullptr;
	virtual void DrawHUD() {}
	void DrawText(const FString&, FLinearColor, float, float, UFont* = nullptr, float = 1.f, bool = false) {}
	void DrawRect(FLinearColor, float, float, float, float) {}
	void DrawLine(float, float, float, float, FLinearColor, float = 0.f) {}
	void GetTextSize(const FString&, float& W, float& H, UFont* = nullptr, float = 1.f) const {}
};

// ------------------------------------------------------------------ Camera

enum class EAutoExposureMethod : uint8 { AEM_Histogram, AEM_Basic, AEM_Manual };
struct FPostProcessSettings
{
	uint8 bOverride_AutoExposureMethod : 1;
	EAutoExposureMethod AutoExposureMethod;
	uint8 bOverride_AutoExposureApplyPhysicalCameraExposure : 1;
	uint8 AutoExposureApplyPhysicalCameraExposure : 1;
	uint8 bOverride_AutoExposureBias : 1;
	float AutoExposureBias;
	uint8 bOverride_BloomIntensity : 1;
	float BloomIntensity;
	uint8 bOverride_VignetteIntensity : 1;
	float VignetteIntensity;
};
class UCameraComponent : public USceneComponent
{
public:
	FPostProcessSettings PostProcessSettings;
	void SetConstraintAspectRatio(bool) {}
	void SetFieldOfView(float) {}
};
class ACameraActor : public AActor
{
public:
	UCameraComponent* GetCameraComponent() const { return nullptr; }
};

// ------------------------------------------------------------------ Save games & statics

class USaveGame : public UObject {};
class USoundBase : public UObject {};
class USoundConcurrency : public UObject {};
class UAudioComponent : public USceneComponent
{
public:
	USoundBase* Sound = nullptr;
	void SetVolumeMultiplier(float) {}
	void Play(float StartTime = 0.f) {}
	void Stop() {}
};
enum ESoundGroup { SOUNDGROUP_Default };
class USoundWave : public USoundBase
{
public:
	int32 NumChannels = 1;
	float Duration = 0.f;
	ESoundGroup SoundGroup = SOUNDGROUP_Default;
	uint8 bLooping : 1;
	void SetSampleRate(uint32) {}
};
class USoundWaveProcedural : public USoundWave
{
public:
	void QueueAudio(const uint8*, const int32) {}
	int32 GetAvailableAudioByteCount() const { return 0; }
};

struct UGameplayStatics
{
	static bool DoesSaveGameExist(const FString&, int32) { return false; }
	static USaveGame* LoadGameFromSlot(const FString&, int32) { return nullptr; }
	static bool SaveGameToSlot(USaveGame*, const FString&, int32) { return true; }
	static USaveGame* CreateSaveGameObject(UClass*) { return nullptr; }
	static bool DeleteGameInSlot(const FString&, int32) { return true; }
	static UAudioComponent* CreateSound2D(const UObject*, USoundBase*, float = 1.f, float = 1.f, float = 0.f, USoundConcurrency* = nullptr, bool = false, bool = true) { return nullptr; }
};

namespace EQuitPreference { enum Type { Quit, Background }; }
struct UKismetSystemLibrary
{
	static void QuitGame(const UObject*, APlayerController*, EQuitPreference::Type, bool) {}
};

// ------------------------------------------------------------------ Materials

class UMaterialInterface : public UObject {};
class UMaterialExpression : public UObject {};
struct FExpressionInput
{
	UMaterialExpression* Expression = nullptr;
	void Connect(int32 OutputIndex, UMaterialExpression* Expr) { Expression = Expr; }
};
class UMaterialExpressionVertexColor : public UMaterialExpression {};
class UMaterialExpressionConstant : public UMaterialExpression { public: float R = 0.f; };
class UMaterialExpressionMultiply : public UMaterialExpression
{
public:
	FExpressionInput A, B;
	float ConstA = 0.f, ConstB = 1.f;
};
struct FMaterialExpressionCollection { void AddExpression(UMaterialExpression*) {} };
class UMaterialEditorOnlyData : public UObject
{
public:
	FExpressionInput BaseColor, Roughness, Specular, EmissiveColor, Opacity;
};
enum EMaterialShadingModel { MSM_Unlit, MSM_DefaultLit };
enum EBlendMode { BLEND_Opaque, BLEND_Translucent, BLEND_Additive };
class UMaterial : public UMaterialInterface
{
public:
	EBlendMode BlendMode = BLEND_Opaque;
	FMaterialExpressionCollection& GetExpressionCollection() { static FMaterialExpressionCollection C; return C; }
	UMaterialEditorOnlyData* GetEditorOnlyData() { return nullptr; }
	void SetShadingModel(EMaterialShadingModel) {}
	void PostEditChange() {}
};
