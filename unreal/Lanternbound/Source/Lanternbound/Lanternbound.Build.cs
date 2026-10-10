using UnrealBuildTool;

public class Lanternbound : ModuleRules
{
	public Lanternbound(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		// Each .cpp keeps small file-local helpers; compiling them separately avoids name clashes.
		bUseUnity = false;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"Json",
			"JsonUtilities",
			"ProceduralMeshComponent",
			"AIModule"
		});
	}
}
