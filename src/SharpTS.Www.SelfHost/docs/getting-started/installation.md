Install SharpTS with one setup command. The installer detects the platform and chooses the recommended distribution automatically.

:::figure installation

## Recommended installation

Use Shell on Linux, WSL, or Apple Silicon macOS:

```bash
curl -fsSL https://sharpts.dev/setup.sh | sh
```

Use PowerShell on Windows:

```powershell
irm https://sharpts.dev/setup.ps1 | iex
```

Both scripts make the same automatic choice:

- With the **.NET 10 SDK or later**, install SharpTS as a .NET global tool.
- Without that SDK, install the self-contained **Native AOT** build for the detected operating system and CPU architecture.

The self-contained build does not require a separate .NET installation. Open a new terminal if the installer changes `PATH`, then verify the command:

```bash
sharpts --version
```

## Upgrade or remove SharpTS

Upgrade the installation managed by the setup script:

```bash
curl -fsSL https://sharpts.dev/setup.sh | sh -s -- upgrade
```

```powershell
& ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) upgrade
```

Remove it with the corresponding action:

```bash
curl -fsSL https://sharpts.dev/setup.sh | sh -s -- remove
```

```powershell
& ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) remove
```

The scripts detect an existing compatible SharpTS installation and keep its installation method during upgrades.

## Select a version or prerelease

Install an exact stable version:

```bash
curl -fsSL https://sharpts.dev/setup.sh | sh -s -- install --version 1.2.3
```

```powershell
& ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) install -Version 1.2.3
```

List prerelease versions, or install a selected prerelease:

```bash
curl -fsSL https://sharpts.dev/setup.sh | sh -s -- list --prerelease
curl -fsSL https://sharpts.dev/setup.sh | sh -s -- install --version 1.3.0-rc.1 --prerelease
```

```powershell
& ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) list -Prerelease
& ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) install -Version 1.3.0-rc.1 -Prerelease
```

## Select the managed self-contained build

The default Native AOT fallback favors fast startup and operation without a runtime. Choose the managed self-contained build when you need the broadest dynamic .NET interop surface, including runtime loading of arbitrary third-party assemblies:

```bash
curl -fsSL https://sharpts.dev/setup.sh | sh -s -- install --method managed
```

```powershell
& ([scriptblock]::Create((irm https://sharpts.dev/setup.ps1))) install -Method managed
```

## Advanced and manual installation

If you deliberately manage .NET tools yourself and already have the .NET 10 SDK or later, use the direct global-tool commands:

```bash
dotnet tool install --global SharpTS
dotnet tool update --global SharpTS
dotnet tool uninstall --global SharpTS
```

For a fully manual installation, open the [SharpTS GitHub Releases page](https://github.com/nickna/SharpTS/releases) and choose the asset matching both the operating system and architecture, such as x64 or Arm64.

- **Managed self-contained** packages bundle the .NET runtime and preserve the broadest dynamic interop support.
- **Native AOT** packages are native executables designed for fast startup and deployment without an installed runtime.

Extract the archive, put the executable in a directory on `PATH`, and run `sharpts --version`. Release asset names can change, so follow the labels on the selected release instead of copying an old filename.

## Troubleshooting

### `dotnet` is missing

Run the recommended setup script without forcing a method. It installs the self-contained Native AOT build when the .NET 10 SDK is unavailable. The explicit `dotnet` method still requires that SDK.

### `sharpts` is missing

Follow any `PATH` instructions printed by the installer, then open a new terminal. For a manually installed global tool, verify the global tool directory is on `PATH` and run `dotnet tool list --global`.

### The binary reports an architecture error

Download the release asset matching both the operating system and CPU architecture. An x64 binary does not run natively on every Arm64 system, and the reverse is also true.

### The installed version is stale

Run the script-based upgrade command above. It upgrades both global-tool and self-contained installations without requiring you to choose a new package manually.
