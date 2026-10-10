#include "LBRules.h"
#include "LBData.h"

// =================================================================== Stats

FLBStats FLBRules::BaseStats(int32 Level)
{
	const int32 L = FMath::Clamp(Level, 1, MaxLevel) - 1;
	FLBStats S;
	S.MaxHp = 120.f + 14.f * L;
	S.Atk = 8.f + 2.f * L;
	S.Def = 2.f + FMath::FloorToFloat(L / 2.f);
	S.Crit = 0.05f;
	S.CritDmg = 0.5f;
	S.MaxStamina = 100.f + 2.f * L;
	S.MaxSpirit = 100.f;
	return S;
}

float FLBRules::RarityMult(int32 Rarity)
{
	static const float Mult[] = {1.f, 1.1f, 1.22f, 1.36f, 1.5f};
	return Mult[FMath::Clamp(Rarity, 0, 4)];
}

static void AddStat(FLBStats& S, const FString& K, float V)
{
	if (K == TEXT("atk")) S.Atk += V;
	else if (K == TEXT("atkPct")) S.AtkPct += V;
	else if (K == TEXT("def")) S.Def += V;
	else if (K == TEXT("maxHp")) S.MaxHp += V;
	else if (K == TEXT("crit")) S.Crit += V;
	else if (K == TEXT("critDmg")) S.CritDmg += V;
	else if (K == TEXT("staminaRegen")) S.StaminaRegen += V;
	else if (K == TEXT("spiritGain")) S.SpiritGain += V;
	else if (K == TEXT("moveSpeed")) S.MoveSpeed += V;
	else if (K == TEXT("lifesteal")) S.Lifesteal += V;
	else if (K == TEXT("burnChance")) S.BurnChance += V;
}

void FLBRules::ItemStats(const ULBData& D, const FLBItemInstance& Inst, TMap<FString, float>& Out)
{
	const FLBItemDef* Def = D.Item(Inst.Id);
	if (!Def) return;
	const float Upg = 1.f + 0.12f * Inst.Level;
	const float Mult = RarityMult(Inst.Rarity) * Upg;
	for (const FLBStat& B : Def->BaseStats)
	{
		const bool bFlat = B.Stat == TEXT("atk") || B.Stat == TEXT("def") || B.Stat == TEXT("maxHp");
		Out.FindOrAdd(B.Stat) += B.Value * (bFlat ? Mult : Upg);
	}
	for (const FLBStat& A : Inst.Affixes) Out.FindOrAdd(A.Stat) += A.Value;
}

FLBStats FLBRules::ComputeStats(const ULBData& D, const FLBGameData& G)
{
	FLBStats S = BaseStats(G.Level);
	const FString& WeaponUid = (G.ActiveWeapon == 1 && !G.Weapon2.IsEmpty()) ? G.Weapon2 : G.Weapon1;
	for (const FString* Uid : {&WeaponUid, &G.Armor, &G.Charm})
	{
		if (Uid->IsEmpty()) continue;
		if (const FLBItemInstance* Inst = FindItemConst(G, *Uid))
		{
			TMap<FString, float> St;
			ItemStats(D, *Inst, St);
			for (const TPair<FString, float>& P : St) AddStat(S, P.Key, P.Value);
		}
	}
	for (const TPair<FString, int32>& Sk : G.Skills)
	{
		const FLBSkillDef* Def = D.Skill(Sk.Key);
		if (!Def || Sk.Value <= 0) continue;
		const int32 Rank = FMath::Min(Sk.Value, Def->MaxRank);
		for (const FLBStat& P : Def->PerRank) AddStat(S, P.Stat, P.Value * Rank);
	}
	S.MaxHp = FMath::RoundToFloat(S.MaxHp);
	S.Atk = FMath::RoundToFloat(S.Atk * 10.f) / 10.f;
	S.Def = FMath::RoundToFloat(S.Def);
	S.Crit = FMath::Min(0.75f, S.Crit);
	return S;
}

bool FLBRules::HasSpecial(const ULBData& D, const FLBGameData& G, const FString& Special)
{
	for (const TPair<FString, int32>& Sk : G.Skills)
	{
		const FLBSkillDef* Def = D.Skill(Sk.Key);
		if (Def && Sk.Value > 0 && Def->Special == Special) return true;
	}
	return false;
}

float FLBRules::DefenseFactor(float Def)
{
	return 100.f / (100.f + FMath::Max(0.f, Def) * 3.f);
}

int32 FLBRules::ComputeDamage(float Atk, float Mult, float AtkPct, float Buff, float Crit, float CritDmg, bool bForceCrit, float TargetDef, FRandomStream& Rng, bool& bOutCrit)
{
	bOutCrit = bForceCrit || Rng.FRand() < Crit;
	float Raw = Atk * Mult * (1.f + AtkPct + Buff);
	if (bOutCrit) Raw *= 1.f + CritDmg;
	const float Variance = 0.92f + Rng.FRand() * 0.16f;
	return FMath::Max(1, FMath::RoundToInt(Raw * Variance * DefenseFactor(TargetDef)));
}

// =================================================================== Inventory

FString FLBRules::NewUid(FLBGameData& G)
{
	return FString::Printf(TEXT("i%d"), G.NextUid++);
}

FLBItemInstance* FLBRules::FindItem(FLBGameData& G, const FString& Uid)
{
	return G.Inventory.FindByPredicate([&](const FLBItemInstance& I) { return I.Uid == Uid; });
}

const FLBItemInstance* FLBRules::FindItemConst(const FLBGameData& G, const FString& Uid)
{
	return G.Inventory.FindByPredicate([&](const FLBItemInstance& I) { return I.Uid == Uid; });
}

int32 FLBRules::CountItem(const FLBGameData& G, const FString& Id)
{
	int32 N = 0;
	for (const FLBItemInstance& I : G.Inventory)
	{
		if (I.Id == Id) N += I.Qty;
	}
	return N;
}

int32 FLBRules::EquipmentCount(const ULBData& D, const FLBGameData& G)
{
	int32 N = 0;
	for (const FLBItemInstance& I : G.Inventory)
	{
		const FLBItemDef* Def = D.Item(I.Id);
		if (Def && Def->IsEquipment()) N++;
	}
	return N;
}

int32 FLBRules::AddItem(const ULBData& D, FLBGameData& G, const FString& Id, int32 Qty, int32 Rarity, const TArray<FLBStat>* Affixes, FString* OutUid)
{
	const FLBItemDef* Def = D.Item(Id);
	if (!Def || Qty <= 0) return 0;
	if (Def->Stackable)
	{
		FLBItemInstance* Stack = G.Inventory.FindByPredicate([&](const FLBItemInstance& I) { return I.Id == Id; });
		const int32 Have = Stack ? Stack->Qty : 0;
		const int32 Add = FMath::Clamp(Def->MaxStack - Have, 0, Qty);
		if (Add > 0)
		{
			if (!Stack)
			{
				FLBItemInstance New;
				New.Uid = NewUid(G);
				New.Id = Id;
				New.Qty = 0;
				Stack = &G.Inventory.Add_GetRef(New);
			}
			Stack->Qty += Add;
			if (OutUid) *OutUid = Stack->Uid;
		}
		G.Coins += (Qty - Add) * Def->Value;
		return Add;
	}
	if (Def->Kind == TEXT("key"))
	{
		if (CountItem(G, Id) > 0) return 0;
		FLBItemInstance New;
		New.Uid = NewUid(G);
		New.Id = Id;
		G.Inventory.Add(New);
		if (OutUid) *OutUid = New.Uid;
		return 1;
	}
	int32 Added = 0;
	for (int32 N = 0; N < Qty; N++)
	{
		FLBItemInstance New;
		New.Uid = NewUid(G);
		New.Id = Id;
		New.Rarity = Def->FixedRarity >= 0 ? Def->FixedRarity : FMath::Max(0, Rarity);
		if (Affixes) New.Affixes = *Affixes;
		else New.Affixes = Def->FixedAffixes;
		if (EquipmentCount(D, G) >= MaxEquipment)
		{
			G.Coins += SellValue(D, New);
			continue;
		}
		G.Inventory.Add(New);
		if (OutUid) *OutUid = New.Uid;
		Added++;
	}
	return Added;
}

bool FLBRules::RemoveItem(FLBGameData& G, const FString& IdOrUid, int32 Qty)
{
	auto Unequip = [&G](const FString& Uid) {
		for (FString* S : {&G.Weapon1, &G.Weapon2, &G.Armor, &G.Charm})
		{
			if (*S == Uid) S->Empty();
		}
	};
	if (FLBItemInstance* ByUid = FindItem(G, IdOrUid))
	{
		if (ByUid->Qty < Qty) return false;
		ByUid->Qty -= Qty;
		if (ByUid->Qty <= 0)
		{
			const FString Uid = ByUid->Uid;
			Unequip(Uid);
			G.Inventory.RemoveAll([&](const FLBItemInstance& I) { return I.Uid == Uid; });
		}
		return true;
	}
	if (CountItem(G, IdOrUid) < Qty) return false;
	int32 Left = Qty;
	for (FLBItemInstance& I : G.Inventory)
	{
		if (I.Id != IdOrUid || Left <= 0) continue;
		const int32 Take = FMath::Min(Left, I.Qty);
		I.Qty -= Take;
		Left -= Take;
		if (I.Qty <= 0) Unequip(I.Uid);
	}
	G.Inventory.RemoveAll([](const FLBItemInstance& I) { return I.Qty <= 0; });
	return true;
}

bool FLBRules::IsEquipped(const FLBGameData& G, const FString& Uid)
{
	return !Uid.IsEmpty() && (G.Weapon1 == Uid || G.Weapon2 == Uid || G.Armor == Uid || G.Charm == Uid);
}

bool FLBRules::Equip(const ULBData& D, FLBGameData& G, const FString& Uid, const FString& Slot)
{
	const FLBItemInstance* Inst = FindItemConst(G, Uid);
	if (!Inst) return false;
	const FLBItemDef* Def = D.Item(Inst->Id);
	if (!Def) return false;
	if (Slot == TEXT("weapon1") || Slot == TEXT("weapon2"))
	{
		if (Def->Kind != TEXT("weapon")) return false;
		if (Slot == TEXT("weapon1"))
		{
			if (G.Weapon2 == Uid) G.Weapon2 = G.Weapon1;
			G.Weapon1 = Uid;
		}
		else
		{
			if (G.Weapon1 == Uid) G.Weapon1 = G.Weapon2;
			G.Weapon2 = Uid;
		}
		if (G.Weapon1.IsEmpty())
		{
			G.Weapon1 = G.Weapon2;
			G.Weapon2.Empty();
		}
		return true;
	}
	if (Slot == TEXT("armor") && Def->Kind == TEXT("armor"))
	{
		G.Armor = Uid;
		return true;
	}
	if (Slot == TEXT("charm") && Def->Kind == TEXT("charm"))
	{
		G.Charm = Uid;
		return true;
	}
	return false;
}

const FLBItemInstance* FLBRules::ActiveWeapon(const FLBGameData& G)
{
	const FString& Uid = (G.ActiveWeapon == 1 && !G.Weapon2.IsEmpty()) ? G.Weapon2 : G.Weapon1;
	return Uid.IsEmpty() ? nullptr : FindItemConst(G, Uid);
}

int32 FLBRules::SellValue(const ULBData& D, const FLBItemInstance& Inst)
{
	const FLBItemDef* Def = D.Item(Inst.Id);
	if (!Def || Def->Kind == TEXT("key")) return 0;
	return FMath::RoundToInt(Def->Value * (1.f + Inst.Rarity * 0.5f) * (1.f + 0.25f * Inst.Level));
}

int32 FLBRules::Sell(const ULBData& D, FLBGameData& G, const FString& Uid)
{
	const FLBItemInstance* Inst = FindItemConst(G, Uid);
	if (!Inst || IsEquipped(G, Uid)) return 0;
	const int32 Coins = SellValue(D, *Inst);
	if (Coins <= 0) return 0;
	RemoveItem(G, Uid, 1);
	G.Coins += Coins;
	return Coins;
}

bool FLBRules::UpgradeCost(const ULBData& D, const FLBItemInstance& Inst, int32& Coins, int32& Ore, int32& Essence)
{
	const FLBItemDef* Def = D.Item(Inst.Id);
	if (!Def || !Def->IsEquipment() || Inst.Level >= MaxUpgrade) return false;
	const int32 Next = Inst.Level + 1;
	Coins = FMath::RoundToInt(35.f * Def->Tier * FMath::Pow(float(Next), 1.35f) + 15.f * Inst.Rarity);
	Ore = Next + Def->Tier;
	Essence = Next >= 4 ? Next - 2 : 0;
	return true;
}

bool FLBRules::Upgrade(const ULBData& D, FLBGameData& G, const FString& Uid)
{
	FLBItemInstance* Inst = FindItem(G, Uid);
	if (!Inst) return false;
	int32 Coins, Ore, Essence;
	if (!UpgradeCost(D, *Inst, Coins, Ore, Essence)) return false;
	if (G.Coins < Coins || CountItem(G, TEXT("spirit_ore")) < Ore || CountItem(G, TEXT("hollow_essence")) < Essence) return false;
	G.Coins -= Coins;
	Inst->Level++;
	// Note: Inst may be invalidated by RemoveItem below, so it is not used afterwards.
	RemoveItem(G, TEXT("spirit_ore"), Ore);
	if (Essence > 0) RemoveItem(G, TEXT("hollow_essence"), Essence);
	return true;
}

// =================================================================== Loot

int32 FLBRules::RollRarity(FRandomStream& Rng, float Luck)
{
	const float Base[] = {60.f, 26.f, 10.f, 3.5f, 0.5f};
	float W[5];
	float Total = 0.f;
	for (int32 I = 0; I < 5; I++)
	{
		W[I] = I == 0 ? FMath::Max(5.f, Base[0] - Luck * 30.f) : Base[I] * (1.f + Luck * I);
		Total += W[I];
	}
	float R = Rng.FRand() * Total;
	for (int32 I = 0; I < 5; I++)
	{
		R -= W[I];
		if (R <= 0.f) return I;
	}
	return 4;
}

struct FLBAffixRange
{
	const TCHAR* Stat;
	float Min;
	float Max;
};

static TArray<FLBAffixRange> AffixPool(const FString& Kind)
{
	if (Kind == TEXT("weapon"))
	{
		return {{TEXT("atkPct"), 0.03f, 0.08f}, {TEXT("crit"), 0.02f, 0.05f}, {TEXT("critDmg"), 0.08f, 0.2f}, {TEXT("lifesteal"), 0.01f, 0.025f}, {TEXT("burnChance"), 0.04f, 0.1f}, {TEXT("spiritGain"), 0.06f, 0.14f}};
	}
	if (Kind == TEXT("armor"))
	{
		return {{TEXT("maxHp"), 8.f, 20.f}, {TEXT("def"), 1.f, 4.f}, {TEXT("staminaRegen"), 0.05f, 0.12f}, {TEXT("moveSpeed"), 0.02f, 0.05f}};
	}
	return {{TEXT("crit"), 0.02f, 0.04f}, {TEXT("maxHp"), 6.f, 16.f}, {TEXT("spiritGain"), 0.05f, 0.12f}, {TEXT("staminaRegen"), 0.05f, 0.1f}, {TEXT("atkPct"), 0.02f, 0.05f}};
}

TArray<FLBStat> FLBRules::RollAffixes(const FLBItemDef& Def, int32 Rarity, FRandomStream& Rng)
{
	TArray<FLBStat> Out = Def.FixedAffixes;
	if (!Def.IsEquipment()) return Out;
	TArray<FLBAffixRange> Pool = AffixPool(Def.Kind);
	Pool.RemoveAll([&](const FLBAffixRange& P) { return Out.ContainsByPredicate([&](const FLBStat& S) { return S.Stat == P.Stat; }); });
	const int32 Count = FMath::Min(Pool.Num(), FMath::Min(3, Rarity));
	const float TierScale = 1.f + 0.5f * (Def.Tier - 1);
	for (int32 I = 0; I < Count; I++)
	{
		const int32 Idx = Rng.RandRange(0, Pool.Num() - 1);
		const FLBAffixRange P = Pool[Idx];
		Pool.RemoveAt(Idx);
		float V = FMath::Lerp(P.Min, P.Max, Rng.FRand()) * TierScale * (Rarity >= 4 ? 1.25f : 1.f);
		const FString Stat(P.Stat);
		V = (Stat == TEXT("maxHp") || Stat == TEXT("def")) ? FMath::RoundToFloat(V) : FMath::RoundToFloat(V * 1000.f) / 1000.f;
		FLBStat S;
		S.Stat = Stat;
		S.Value = V;
		Out.Add(S);
	}
	return Out;
}

FString FLBRules::RollEquipmentId(const ULBData& D, FRandomStream& Rng, int32 Tier)
{
	TArray<TPair<FString, float>> Pool;
	float Total = 0.f;
	for (const TPair<FString, FLBItemDef>& P : D.Items)
	{
		const FLBItemDef& Def = P.Value;
		if (!Def.IsEquipment() || Def.FixedRarity >= 0 || Def.Tier > Tier) continue;
		const float W = Def.Tier == Tier ? 3.f : 1.f;
		Pool.Add(TPair<FString, float>(Def.Id, W));
		Total += W;
	}
	if (Pool.Num() == 0) return FString();
	float R = Rng.FRand() * Total;
	for (const TPair<FString, float>& P : Pool)
	{
		R -= P.Value;
		if (R <= 0.f) return P.Key;
	}
	return Pool.Last().Key;
}

// =================================================================== Progression

int32 FLBRules::XpToNext(int32 Level)
{
	return 40 + 40 * Level;
}

int32 FLBRules::AddXp(FLBGameData& G, int32 Amount)
{
	if (G.Level >= MaxLevel || Amount <= 0) return 0;
	G.Xp += Amount;
	int32 Gained = 0;
	while (G.Level < MaxLevel && G.Xp >= XpToNext(G.Level))
	{
		G.Xp -= XpToNext(G.Level);
		G.Level++;
		G.SkillPoints++;
		Gained++;
	}
	if (G.Level >= MaxLevel) G.Xp = 0;
	return Gained;
}

FString FLBRules::TrainSkill(const ULBData& D, FLBGameData& G, const FString& SkillId)
{
	const FLBSkillDef* Def = D.Skill(SkillId);
	if (!Def) return TEXT("Unknown skill");
	const int32 Rank = G.Skills.FindRef(SkillId);
	if (Rank >= Def->MaxRank) return TEXT("Mastered");
	if (Def->RequiresLevel > 0 && G.Level < Def->RequiresLevel) return FString::Printf(TEXT("Requires level %d"), Def->RequiresLevel);
	if (G.SkillPoints <= 0) return TEXT("No skill points");
	G.Skills.Add(SkillId, Rank + 1);
	G.SkillPoints--;
	return FString();
}

// =================================================================== Quests

FLBQuestState* FLBRules::QuestState(FLBGameData& G, const FString& Id)
{
	return G.ActiveQuests.FindByPredicate([&](const FLBQuestState& Q) { return Q.Id == Id; });
}

const FLBQuestState* FLBRules::QuestStateConst(const FLBGameData& G, const FString& Id)
{
	return G.ActiveQuests.FindByPredicate([&](const FLBQuestState& Q) { return Q.Id == Id; });
}

bool FLBRules::IsDone(const FLBGameData& G, const FString& Id)
{
	return G.CompletedQuests.Contains(Id);
}

bool FLBRules::CanStart(const ULBData& D, const FLBGameData& G, const FString& Id)
{
	const FLBQuestDef* Q = D.Quests.Find(Id);
	if (!Q || QuestStateConst(G, Id) || IsDone(G, Id)) return false;
	for (const FString& P : Q->Prereqs)
	{
		if (!IsDone(G, P)) return false;
	}
	for (const FString& F : Q->RequiresFlags)
	{
		if (G.Flags.FindRef(F) <= 0) return false;
	}
	return true;
}

const FLBObjective* FLBRules::CurrentObjective(const ULBData& D, const FLBGameData& G, const FString& Id)
{
	const FLBQuestState* St = QuestStateConst(G, Id);
	const FLBQuestDef* Q = D.Quests.Find(Id);
	if (!St || !Q || !Q->Objectives.IsValidIndex(St->Stage)) return nullptr;
	return &Q->Objectives[St->Stage];
}

void FLBRules::StartQuest(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Id, TArray<FLBQuestUpdate>& Out)
{
	if (!CanStart(D, G, Id)) return;
	const FLBQuestDef& Q = D.Quests[Id];
	FLBQuestState St;
	St.Id = Id;
	G.ActiveQuests.Add(St);
	if (G.TrackedQuest.IsEmpty() || Q.Kind == TEXT("main")) G.TrackedQuest = Id;
	for (const FLBItemRef& It : Q.StartItems) AddItem(D, G, It.Id, It.Qty);
	FLBQuestUpdate U;
	U.Kind = FLBQuestUpdate::Started;
	U.QuestId = Id;
	U.Text = FString::Printf(TEXT("New %sQuest: %s"), Q.Kind == TEXT("main") ? TEXT("Story ") : TEXT(""), *Q.Title);
	Out.Add(U);
	CheckCollect(D, G, Rng, Out);
}

void FLBRules::Notify(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Type, const FString& Target, const FString& OnlyQuest, TArray<FLBQuestUpdate>& Out)
{
	TArray<FString> Ids;
	for (const FLBQuestState& Q : G.ActiveQuests) Ids.Add(Q.Id);
	for (const FString& Id : Ids)
	{
		if (!OnlyQuest.IsEmpty() && OnlyQuest != Id) continue;
		const FLBObjective* Obj = CurrentObjective(D, G, Id);
		if (!Obj || Obj->Type != Type) continue;
		if (!(Obj->Type == TEXT("kill") && Obj->Target == TEXT("any")) && Obj->Target != Target) continue;
		FLBQuestState* St = QuestState(G, Id);
		const int32 Need = FMath::Max(1, Obj->Count);
		St->Progress = FMath::Min(Need, St->Progress + 1);
		if (St->Progress >= Need) Advance(D, G, Rng, Id, Out);
		else
		{
			FLBQuestUpdate U;
			U.Kind = FLBQuestUpdate::Progress;
			U.QuestId = Id;
			U.Text = FString::Printf(TEXT("%s: %d/%d"), *Obj->Text, St->Progress, Need);
			Out.Add(U);
		}
	}
	if (Type != TEXT("collect")) CheckCollect(D, G, Rng, Out);
}

void FLBRules::CheckCollect(const ULBData& D, FLBGameData& G, FRandomStream& Rng, TArray<FLBQuestUpdate>& Out)
{
	TArray<FString> Ids;
	for (const FLBQuestState& Q : G.ActiveQuests) Ids.Add(Q.Id);
	for (const FString& Id : Ids)
	{
		const FLBObjective* Obj = CurrentObjective(D, G, Id);
		if (!Obj || Obj->Type != TEXT("collect")) continue;
		const int32 Have = CountItem(G, Obj->Target);
		const int32 Need = FMath::Max(1, Obj->Count);
		FLBQuestState* St = QuestState(G, Id);
		if (Have >= Need)
		{
			if (Obj->Consume) RemoveItem(G, Obj->Target, Need);
			Advance(D, G, Rng, Id, Out);
		}
		else if (St && St->Progress != Have)
		{
			St->Progress = Have;
			FLBQuestUpdate U;
			U.Kind = FLBQuestUpdate::Progress;
			U.QuestId = Id;
			U.Text = FString::Printf(TEXT("%s: %d/%d"), *Obj->Text, Have, Need);
			Out.Add(U);
		}
	}
}

void FLBRules::Advance(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Id, TArray<FLBQuestUpdate>& Out)
{
	const FLBQuestDef& Q = D.Quests[Id];
	FLBQuestState* St = QuestState(G, Id);
	if (!St) return;
	St->Stage++;
	St->Progress = 0;
	if (St->Stage >= Q.Objectives.Num())
	{
		Complete(D, G, Rng, Id, Out);
		return;
	}
	FLBQuestUpdate U;
	U.Kind = FLBQuestUpdate::Objective;
	U.QuestId = Id;
	U.Text = TEXT("Objective: ") + Q.Objectives[St->Stage].Text;
	Out.Add(U);
	CheckCollect(D, G, Rng, Out);
}

void FLBRules::Complete(const ULBData& D, FLBGameData& G, FRandomStream& Rng, const FString& Id, TArray<FLBQuestUpdate>& Out)
{
	const FLBQuestDef& Q = D.Quests[Id];
	G.ActiveQuests.RemoveAll([&](const FLBQuestState& S) { return S.Id == Id; });
	G.CompletedQuests.AddUnique(Id);
	G.Coins += Q.RewardCoins;
	const int32 Levels = AddXp(G, Q.RewardXp);
	TArray<FString> Parts;
	if (Q.RewardXp > 0) Parts.Add(FString::Printf(TEXT("%d XP"), Q.RewardXp));
	if (Q.RewardCoins > 0) Parts.Add(FString::Printf(TEXT("%d coins"), Q.RewardCoins));
	for (const FLBItemRef& It : Q.RewardItems)
	{
		const FLBItemDef* Def = D.Item(It.Id);
		if (!Def) continue;
		if (Def->IsEquipment())
		{
			const int32 Rarity = Def->FixedRarity >= 0 ? Def->FixedRarity : FMath::Max(0, It.Rarity);
			const TArray<FLBStat> Affixes = RollAffixes(*Def, Rarity, Rng);
			AddItem(D, G, It.Id, 1, Rarity, &Affixes);
		}
		else AddItem(D, G, It.Id, It.Qty);
		Parts.Add(It.Qty > 1 ? FString::Printf(TEXT("%s x%d"), *Def->Name, It.Qty) : Def->Name);
	}
	for (const FString& F : Q.RewardFlags) G.Flags.Add(F, 1);
	if (G.TrackedQuest == Id) G.TrackedQuest.Empty();
	FLBQuestUpdate U;
	U.Kind = FLBQuestUpdate::Completed;
	U.QuestId = Id;
	U.LevelsGained = Levels;
	U.Text = FString::Printf(TEXT("Quest Complete: %s%s%s"), *Q.Title, Parts.Num() ? TEXT(" - ") : TEXT(""), *FString::Join(Parts, TEXT(", ")));
	Out.Add(U);
	for (const FString& N : Q.Next) StartQuest(D, G, Rng, N, Out);
	if (G.TrackedQuest.IsEmpty() && G.ActiveQuests.Num() > 0) G.TrackedQuest = G.ActiveQuests[0].Id;
}

FString FLBRules::ObjectiveText(const ULBData& D, const FLBGameData& G, const FString& Id)
{
	const FLBObjective* Obj = CurrentObjective(D, G, Id);
	if (!Obj) return FString();
	const int32 Need = FMath::Max(1, Obj->Count);
	if (Need > 1)
	{
		const FLBQuestState* St = QuestStateConst(G, Id);
		const int32 Have = Obj->Type == TEXT("collect") ? FMath::Min(Need, CountItem(G, Obj->Target)) : (St ? St->Progress : 0);
		return FString::Printf(TEXT("%s (%d/%d)"), *Obj->Text, Have, Need);
	}
	return Obj->Text;
}

// =================================================================== Dialogue

bool FLBRules::EvalCond(const ULBData& D, const FLBGameData& G, const FLBCond& C)
{
	auto SplitPair = [](const FString& S, FString& A, int32& N, int32 Default) {
		FString B;
		if (S.Split(TEXT(":"), &A, &B)) N = FCString::Atoi(*B);
		else
		{
			A = S;
			N = Default;
		}
	};
	if (!C.Active.IsEmpty())
	{
		FString Id;
		int32 Stage;
		SplitPair(C.Active, Id, Stage, -1);
		const FLBQuestState* St = QuestStateConst(G, Id);
		if (!St || (Stage >= 0 && St->Stage != Stage)) return false;
	}
	if (!C.ActiveFrom.IsEmpty())
	{
		FString Id;
		int32 Stage;
		SplitPair(C.ActiveFrom, Id, Stage, 0);
		const FLBQuestState* St = QuestStateConst(G, Id);
		if (!St || St->Stage < Stage) return false;
	}
	if (!C.Done.IsEmpty() && !IsDone(G, C.Done)) return false;
	if (!C.NotDone.IsEmpty() && IsDone(G, C.NotDone)) return false;
	if (!C.Available.IsEmpty() && !CanStart(D, G, C.Available)) return false;
	if (!C.Flag.IsEmpty() && G.Flags.FindRef(C.Flag) <= 0) return false;
	if (!C.NotFlag.IsEmpty() && G.Flags.FindRef(C.NotFlag) > 0) return false;
	if (!C.Has.IsEmpty())
	{
		FString Id;
		int32 Qty;
		SplitPair(C.Has, Id, Qty, 1);
		if (CountItem(G, Id) < Qty) return false;
	}
	return true;
}

const FLBNpcDialogueEntry* FLBRules::SelectDialogue(const ULBData& D, const FLBGameData& G, const FString& NpcId)
{
	const TArray<FLBNpcDialogueEntry>* Entries = D.NpcDialogue.Find(NpcId);
	if (!Entries) return nullptr;
	for (const FLBNpcDialogueEntry& E : *Entries)
	{
		if (EvalCond(D, G, E.Cond)) return &E;
	}
	return nullptr;
}

// =================================================================== New game & validation

FLBGameData FLBRules::NewGame(const ULBData& D, FRandomStream& Rng, TArray<FLBQuestUpdate>& Out)
{
	FLBGameData G;
	FString Uid;
	AddItem(D, G, TEXT("katana_wanderer"), 1, 0, nullptr, &Uid);
	G.Weapon1 = Uid;
	AddItem(D, G, TEXT("armor_traveler"), 1, 0, nullptr, &Uid);
	G.Armor = Uid;
	AddItem(D, G, TEXT("dango"), 2);
	StartQuest(D, G, Rng, TEXT("mq_oath"), Out);
	// The opening quest hands over a bow; carry it in the second weapon slot.
	for (const FLBItemInstance& I : G.Inventory)
	{
		if (I.Id == TEXT("bow_willow")) G.Weapon2 = I.Uid;
	}
	return G;
}

TArray<FString> FLBRules::Sanitize(const ULBData& D, FLBGameData& G)
{
	TArray<FString> Warnings;
	const int32 Before = G.Inventory.Num();
	G.Inventory.RemoveAll([&](const FLBItemInstance& I) { return !D.Item(I.Id) || I.Qty <= 0; });
	if (G.Inventory.Num() != Before) Warnings.Add(TEXT("Removed unknown items from the save."));
	for (FLBItemInstance& I : G.Inventory)
	{
		I.Rarity = FMath::Clamp(I.Rarity, 0, 4);
		I.Level = FMath::Clamp(I.Level, 0, MaxUpgrade);
	}
	for (FString* Slot : {&G.Weapon1, &G.Weapon2, &G.Armor, &G.Charm})
	{
		if (!Slot->IsEmpty() && !FindItemConst(G, *Slot))
		{
			Slot->Empty();
			Warnings.Add(TEXT("Unequipped a missing item."));
		}
	}
	if (G.Weapon1.IsEmpty())
	{
		for (const FLBItemInstance& I : G.Inventory)
		{
			const FLBItemDef* Def = D.Item(I.Id);
			if (Def && Def->Kind == TEXT("weapon"))
			{
				G.Weapon1 = I.Uid;
				break;
			}
		}
		if (G.Weapon1.IsEmpty())
		{
			FString Uid;
			AddItem(D, G, TEXT("katana_wanderer"), 1, 0, nullptr, &Uid);
			G.Weapon1 = Uid;
			Warnings.Add(TEXT("No weapon found; a replacement katana was provided."));
		}
	}
	if (G.Weapon2 == G.Weapon1) G.Weapon2.Empty();
	if (G.Weapon2.IsEmpty()) G.ActiveWeapon = 0;
	G.Level = FMath::Clamp(G.Level, 1, MaxLevel);
	G.Coins = FMath::Max(0, G.Coins);
	G.HpFrac = FMath::Clamp(G.HpFrac, 0.05f, 1.f);
	G.ActiveQuests.RemoveAll([&](const FLBQuestState& Q) { return !D.Quests.Contains(Q.Id) || G.CompletedQuests.Contains(Q.Id); });
	for (FLBQuestState& Q : G.ActiveQuests) Q.Stage = FMath::Clamp(Q.Stage, 0, D.Quests[Q.Id].Objectives.Num() - 1);
	return Warnings;
}

// =================================================================== Additional inventory rules

bool FLBRules::Unequip(FLBGameData& G, const FString& Slot)
{
	// Always keep at least one weapon equipped.
	if (Slot == TEXT("weapon1") && G.Weapon2.IsEmpty()) return false;
	if (Slot == TEXT("weapon2") && G.Weapon1.IsEmpty()) return false;
	if (Slot == TEXT("weapon1"))
	{
		G.Weapon1 = G.Weapon2;
		G.Weapon2.Empty();
	}
	else if (Slot == TEXT("weapon2")) G.Weapon2.Empty();
	else if (Slot == TEXT("armor")) G.Armor.Empty();
	else if (Slot == TEXT("charm")) G.Charm.Empty();
	else return false;
	G.ActiveWeapon = 0;
	return true;
}

bool FLBRules::Buy(const ULBData& D, FLBGameData& G, const FString& Id, int32 Price, int32 Qty)
{
	const FLBItemDef* Def = D.Item(Id);
	const int32 Total = Price * Qty;
	if (!Def || G.Coins < Total) return false;
	if (Def->Stackable && CountItem(G, Id) + Qty > (Def->MaxStack > 0 ? Def->MaxStack : 99)) return false;
	G.Coins -= Total;
	AddItem(D, G, Id, Qty);
	return true;
}

int32 FLBRules::ResetSkills(FLBGameData& G)
{
	int32 Refunded = 0;
	for (const TPair<FString, int32>& P : G.Skills) Refunded += P.Value;
	G.Skills.Reset();
	G.SkillPoints += Refunded;
	return Refunded;
}

FLBItemInstance FLBRules::GenerateEquipment(const ULBData& D, const FString& Id, FRandomStream& Rng, int32 Rarity)
{
	FLBItemInstance I;
	I.Id = Id;
	const FLBItemDef* Def = D.Item(Id);
	if (!Def) return I;
	I.Rarity = Def->FixedRarity >= 0 ? Def->FixedRarity : (Rarity >= 0 ? Rarity : RollRarity(Rng));
	I.Affixes = RollAffixes(*Def, I.Rarity, Rng);
	return I;
}

FLBItemInstance FLBRules::RollEquipmentDrop(const ULBData& D, FRandomStream& Rng, int32 AreaTier)
{
	const FString Id = RollEquipmentId(D, Rng, AreaTier);
	return GenerateEquipment(D, Id, Rng, RollRarity(Rng, (AreaTier - 1) * 0.15f));
}

void FLBRules::RollEnemyDrops(const ULBData& D, const FLBEnemyDef& Def, FRandomStream& Rng, int32 AreaTier, float CoinMult, int32& OutCoins, TArray<FLBItemRef>& OutItems, TArray<FLBItemInstance>& OutEquipment)
{
	OutCoins = FMath::RoundToInt(Rng.RandRange(Def.CoinsMin, FMath::Max(Def.CoinsMin, Def.CoinsMax)) * CoinMult);
	for (const FLBDrop& Drop : Def.Drops)
	{
		if (Rng.FRand() < Drop.Chance)
		{
			FLBItemRef R;
			R.Id = Drop.Item;
			R.Qty = Rng.RandRange(Drop.QtyMin, FMath::Max(Drop.QtyMin, Drop.QtyMax));
			OutItems.Add(R);
		}
	}
	if (Def.EquipChance > 0.f && Rng.FRand() < Def.EquipChance)
	{
		FLBItemInstance E = RollEquipmentDrop(D, Rng, AreaTier);
		if (!E.Id.IsEmpty()) OutEquipment.Add(E);
	}
}

// =================================================================== Dialogue helpers

int32 FLBRules::NpcQuestMarker(const ULBData& D, const FLBGameData& G, const FString& NpcId)
{
	const FLBNpcDialogueEntry* Entry = SelectDialogue(D, G, NpcId);
	if (!Entry) return 0;
	if (!Entry->Quest.IsEmpty() && !Entry->NoTalk) return 2;
	if (const FLBDialogue* Dlg = D.Dialogues.Find(Entry->Dialogue))
	{
		for (const FLBDialogueNode& N : Dlg->Nodes)
		{
			for (const FLBDialogueChoice& C : N.Choices)
			{
				if (!C.Cond.Available.IsEmpty() && EvalCond(D, G, C.Cond)) return 1;
			}
		}
	}
	return 0;
}

static TArray<FString> AreaLinks(const FString& Id)
{
	if (Id == TEXT("village")) return {TEXT("bamboo"), TEXT("marsh"), TEXT("summit")};
	if (Id == TEXT("marsh")) return {TEXT("village"), TEXT("catacombs")};
	if (Id == TEXT("catacombs")) return {TEXT("marsh")};
	if (Id == TEXT("bamboo") || Id == TEXT("summit")) return {TEXT("village")};
	return {};
}

FString FLBRules::NextAreaToward(const FString& From, const FString& To)
{
	if (From == To) return FString();
	TMap<FString, FString> Prev;
	TArray<FString> Queue = {From};
	TSet<FString> Seen = {From};
	for (int32 Head = 0; Head < Queue.Num(); Head++)
	{
		const FString Cur = Queue[Head];
		for (const FString& N : AreaLinks(Cur))
		{
			if (Seen.Contains(N)) continue;
			Seen.Add(N);
			Prev.Add(N, Cur);
			if (N == To)
			{
				FString Step = N;
				while (Prev[Step] != From) Step = Prev[Step];
				return Step;
			}
			Queue.Add(N);
		}
	}
	return FString();
}

FString FLBRules::AreaName(const FString& Id)
{
	if (Id == TEXT("village")) return TEXT("Akari Village");
	if (Id == TEXT("bamboo")) return TEXT("Sasagiri Bamboo Grove");
	if (Id == TEXT("marsh")) return TEXT("Mistfen Marsh");
	if (Id == TEXT("catacombs")) return TEXT("Hollow Catacombs");
	if (Id == TEXT("summit")) return TEXT("Hinoyama Summit");
	return Id;
}

// =================================================================== Dialogue runner

bool FLBDialogueRunner::Start(const ULBData& D, const FString& DialogueId)
{
	Dialogue = D.Dialogues.Find(DialogueId);
	PendingActions.Reset();
	if (!Dialogue) return false;
	NodeId = Dialogue->Start;
	EnterNode();
	return true;
}

TArray<const FLBDialogueChoice*> FLBDialogueRunner::VisibleChoices(const ULBData& D, const FLBGameData& G) const
{
	TArray<const FLBDialogueChoice*> Out;
	if (const FLBDialogueNode* N = Node())
	{
		for (const FLBDialogueChoice& C : N->Choices)
		{
			if (FLBRules::EvalCond(D, G, C.Cond)) Out.Add(&C);
		}
	}
	return Out;
}

void FLBDialogueRunner::EnterNode()
{
	if (const FLBDialogueNode* N = Node()) PendingActions.Append(N->Actions);
}

void FLBDialogueRunner::Advance(const ULBData& D, const FLBGameData& G)
{
	const FLBDialogueNode* N = Node();
	if (!N || VisibleChoices(D, G).Num() > 0) return;
	NodeId = N->Next;
	EnterNode();
}

void FLBDialogueRunner::Choose(const ULBData& D, const FLBGameData& G, int32 Index)
{
	const TArray<const FLBDialogueChoice*> Choices = VisibleChoices(D, G);
	if (!Choices.IsValidIndex(Index)) return;
	PendingActions.Append(Choices[Index]->Actions);
	NodeId = Choices[Index]->Next;
	EnterNode();
}

TArray<FString> FLBDialogueRunner::TakeActions()
{
	TArray<FString> Out = MoveTemp(PendingActions);
	PendingActions.Reset();
	return Out;
}
