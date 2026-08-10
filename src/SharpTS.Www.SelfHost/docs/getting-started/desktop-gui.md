SharpTS 1.0.9 can build retained, reactive desktop applications entirely in TypeScript and TSX. The GUI SDK hosts those applications on Avalonia, so you can create native windows and controls without writing C# or AXAML.

**Preview status:** Desktop GUI support is a work in progress. Windows x64 and Arm64 are the supported preview targets. macOS packages are experimental, and preview APIs may change before a stable GUI release.

## Install the prerequisites

GUI development requires the **.NET 10 SDK or later**, even if you normally run SharpTS from a self-contained executable. Check the SDK, then install SharpTS 1.0.9 as a global tool:

```powershell
dotnet --version
dotnet tool install --global SharpTS --version 1.0.9
sharpts --version
```

If SharpTS is already installed, update it instead:

```powershell
dotnet tool update --global SharpTS --version 1.0.9
```

## Create your first application

Create a project and move into it:

```powershell
sharpts new avalonia -n CounterApp
cd CounterApp
```

The generated application contains only TypeScript, TSX, configuration, and assets:

```text
CounterApp/
  Assets/
  headless.tests.tsx
  main.tsx
  sharpts.json
  tsconfig.json
```

`sharpts.json` identifies the application as Avalonia-based and pins the matching GUI SDK. SharpTS materializes the internal MSBuild project and `@sharpts/gui` package when you build or run the application; you do not need to maintain a C# project.

## Understand the counter UI

The generated `main.tsx` is a complete application:

```tsx
import {
    Button,
    StackPanel,
    TextBlock,
    Window,
    createDesktopApplication,
    useState,
} from "@sharpts/gui";

function App() {
    const [count, setCount] = useState(0);
    return (
        <Window title="CounterApp" width={420} height={240}>
            <StackPanel spacing={12} margin={24}>
                <TextBlock fontSize={24}>CounterApp</TextBlock>
                <TextBlock key="count">{`Count: ${count}`}</TextBlock>
                <Button key="increment" onClick={() => setCount(value => value + 1)}>
                    Increment
                </Button>
            </StackPanel>
        </Window>
    );
}

const application = createDesktopApplication();
application.createWindow(<App />, { main: true });
```

`createDesktopApplication` owns the application lifecycle. Each window has one `Window` root, while layout and native controls are expressed as typed TSX. `useState` schedules reactive updates, and stable `key` values preserve control identity as the tree changes.

## Run and edit the application

Start with interpreted mode for the shortest development loop:

```powershell
sharpts app run
```

Run the same source as a compiled SharpTS guest to check that path too:

```powershell
sharpts app run --mode compiled
```

For interpreted development, watch the project for changes:

```powershell
sharpts app run --mode interpreted -- --watch
```

A valid edit starts a fresh application runtime, so local component state and lifecycle resources reset. If an edit is invalid, the last good UI remains mounted while SharpTS reports the error.

## Run the headless smoke test

The template includes `headless.tests.tsx`. It mounts a window without opening it, uses the supported testing driver, and exits nonzero if its assertions fail:

```powershell
sharpts app run headless.tests.tsx --mode interpreted -- --headless
sharpts app run headless.tests.tsx --mode compiled -- --headless
```

Use stable control keys such as `increment` and `count` when a headless test needs to click a control or inspect its text. The testing driver is available only when the application runs with `--headless`.

## Publish a Windows executable

Publish a self-contained, compiled single-file application for 64-bit Windows:

```powershell
sharpts app publish --rid win-x64 --self-contained true --single-file true
```

The default output is `dist/win-x64`. A single-file publish embeds the compiled guest and cannot run in interpreted mode. Use `win-arm64` for Windows on Arm64.

Native AOT, signed MSIX installers, updates, and application identity are separate release concerns. Review the upstream [GUI SDK workflow](https://github.com/nickna/SharpTS/blob/v1.0.9/docs/gui/sdk-development.md) and [Windows distribution guide](https://github.com/nickna/SharpTS/blob/v1.0.9/docs/gui/windows-distribution.md) before shipping an application.

## Explore the preview surface

The GUI package includes layouts, text and image display, buttons, form controls, menus, tabs, lists, trees, canvas drawing, dialogs, clipboard access, multiple windows, application resources, styles, and headless developer tools. See the [TSX API reference](https://github.com/nickna/SharpTS/blob/v1.0.9/docs/gui/tsx-api.md) and the complete [Calculator example](https://github.com/nickna/SharpTS/tree/v1.0.9/Examples/Calculator) for larger examples.

Current boundaries include one `Window` root per window, built-in or statically registered controls, simple string-backed combo and list items, and no arbitrary Avalonia templates or full editing `DataGrid`. Treat the preview as an opportunity to build and evaluate applications while the SDK and compatibility policy continue to mature.
