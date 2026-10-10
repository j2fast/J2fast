using UnrealBuildTool;

public class LanternboundTarget : TargetRules
{
	public LanternboundTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Lanternbound");
	}
}
