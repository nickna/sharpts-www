Install SharpTS as a .NET global tool when the .NET 10 SDK is available, or use a self-contained release on machines without .NET.

:::figure installation

## Prerequisites

The global-tool installation requires the **.NET 10 SDK or later**. Check the installed SDK with:

```bash
dotnet --version
```

Self-contained release binaries include what SharpTS needs to run and do **not** require an installed .NET runtime.

## macOS

Install the preferred global tool and verify it:

```bash
dotnet tool install --global SharpTS
sharpts --version
```

Global tools are normally placed in `$HOME/.dotnet/tools`. If `sharpts` is not found after installation, add that directory to your shell's `PATH`, then open a new terminal.

## Linux

Install the preferred global tool and verify it:

```bash
dotnet tool install --global SharpTS
sharpts --version
```

Global tools are normally placed in `$HOME/.dotnet/tools`. If the command is unavailable, ensure that directory is on `PATH` and restart the shell session.

## Windows

Run the preferred commands in PowerShell or Windows Terminal:

```powershell
dotnet tool install --global SharpTS
sharpts --version
```

Global tools are normally placed in `%USERPROFILE%\.dotnet\tools`. If Windows cannot find `sharpts`, add that directory to the user `PATH` and open a new terminal.

## Install without .NET

Open the [SharpTS GitHub Releases page](https://github.com/nickna/SharpTS/releases) and choose the asset that matches your operating system and architecture. Release names can change, so use the labels on the latest release rather than copying an old filename.

- **Managed self-contained** packages bundle the .NET runtime and favor broad compatibility.
- **Native AOT** packages are ahead-of-time native executables designed for fast startup and deployment without a runtime.

Confirm both the operating system and architecture, such as x64 or Arm64, before downloading. Extract the archive, put the executable in a directory on `PATH`, and run `sharpts --version`.

## Update or remove the global tool

Update to the current package:

```bash
dotnet tool update --global SharpTS
```

Remove the global tool:

```bash
dotnet tool uninstall --global SharpTS
```

## Troubleshooting

### `dotnet` is missing

Install the .NET 10 SDK or choose a self-contained SharpTS release. Installing only an older runtime is not enough for the global-tool workflow.

### `sharpts` is missing

Verify the global tool directory is on `PATH`, restart the terminal, and run `dotnet tool list --global` to confirm the installation.

### The binary reports an architecture error

Download the release asset matching both the operating system and CPU architecture. An x64 binary does not run natively on every Arm64 system, and the reverse is also true.

### The installed version is stale

Run the global update command above. For a self-contained install, download and replace it with the appropriate asset from the latest GitHub release.
