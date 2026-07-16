# Devin desktop assistant

Devin is a local-first, graphical personal desktop assistant. It provides text commands, an optional voice-mode control, web research shortcuts, visible desktop-folder actions, and concurrent execution for independent approved actions.

## Run from source

Windows 10/11 with Python 3.10+ is recommended. Run:

```bat
py devin.py
```

## Download a Windows `.exe`

This repository includes a GitHub Actions workflow that builds the executable on a real Windows runner. Open the repository's **Actions** tab, select **Build Devin for Windows**, choose **Run workflow**, then download the **Devin-windows-x64** artifact from the completed run. It contains `Devin.exe`.

## Build a Windows `.exe` locally

On the **Windows computer where you want to run it**, double-click `build_windows_exe.bat`, or run it from Command Prompt. The result is the single file `dist\Devin.exe`.

PyInstaller builds Windows executables on Windows. Cross-building a supported Windows 7 executable is not reliable with current Python and PyInstaller releases; Windows 10/11 is the supported target. Use an older, separately tested Python/PyInstaller toolchain only if legacy Windows support is essential.

## Safety and privacy

Devin uses an explicit, small action allowlist. It opens a browser or a requested standard folder, and reports each action in the transcript. It deliberately does **not** execute arbitrary shell commands or silently operate other applications. Add integrations only with clear user consent and confirmation for sensitive actions.
