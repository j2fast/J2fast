using UnrealBuildTool;

public class LanternboundEditorTarget : TargetRules
{
	public LanternboundEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Lanternbound");
	}
}
