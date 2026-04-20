# QuantumLang VS Code Adapter Troubleshooting

This adapter is intentionally thin. When something fails, first decide whether
the problem is editor plumbing, server launch, or compiler diagnostics.

## `qtlcPath` Problems

The extension starts `qtlc server` using `quantumlang.qtlcPath`.

Common fixes:

- Build the compiler first:

  ```sh
  cmake --build qtlc/build
  ```

- For normal daily use, install the compiler on `PATH`:

  ```sh
  sudo ./qtlc/scripts/install-system.sh
  qtlc --version
  ```

- On Linux this installs to `/usr/local/bin/qtlc`.
- In the bundled sample workspace, the expected path is:

  ```text
  ${workspaceFolder}/../../../build/compiler/driver/qtlc
  ```

- When `quantumlang.qtlcPath` is still the default `qtlc`, the adapter also
  tries to auto-detect source-tree builds named `build/compiler/driver/qtlc` or
  `qtlc/build/compiler/driver/qtlc` from workspace parent directories.
- If the binary lives somewhere else, set `quantumlang.qtlcPath` to an absolute
  path or a path that uses `${workspaceFolder}`.
- If you see `spawn qtlc ENOENT`, VS Code could not find `qtlc` on `PATH`.
  Set `quantumlang.qtlcPath` to an absolute binary path. In this source tree,
  the local build path is usually
  `/home/maram/Documents/QLang/quantumlang/qtlc/build/compiler/driver/qtlc`.
- Run `QuantumLang: Show Server Output` and check the exact launch error.

## Workspace Root Problems

The server needs a package root that contains `quantum.toml`.

For editor requests, the adapter first tries the nearest parent directory of
the current `.qn` file that contains `quantum.toml`. This keeps nested samples,
fixtures, and multi-package workspaces from accidentally using the outer
workspace folder. The manually selected package root remains the fallback for
build/run commands and documents without a nearby manifest.

Common fixes:

- Open the package directory, not only one source file.
- Run `QuantumLang: Select Package Root` in a multi-root workspace.
- Check that the selected root is shown in the QTLC status bar.
- If the wrong root is remembered, select the correct root again. The adapter
  persists the selected root per workspace.

## Package Target Problems

Editor queries are routed with `quantumlang.packageTarget`.

Common fixes:

- Leave `quantumlang.packageTarget` as `app` for normal single-target packages.
- Change it only when the package manifest declares a different target.
- Check the status bar and hover footer. Both show the package root and target
  used by editor requests.

## Server Start Or Crash Problems

The extension restarts unexpected `qtlc server` exits with bounded backoff.

Common fixes:

- Open `QuantumLang: Show Server Output`.
- Look for `qtlc server exited` or `qtlc server failed` lines.
- Confirm `qtlc server` runs manually from the selected package root.
- If repeated crashes stop restart attempts, fix the server error and reload the
  VS Code window or change `quantumlang.qtlcPath` to trigger a clean restart.
- Run `QuantumLang: Restart Language Server` for a clean manual restart without
  changing settings.

## Installed Extension Problems

The `.vsix` package does not bundle `qtlc`; it only launches the configured
compiler binary.

Common fixes:

- Run `npm run package:release-check` to catch missing release metadata before
  building the `.vsix`.
- Run `npm run package:check` before building the `.vsix` to confirm the
  compiled adapter and package file list are sane.
- If packaging or install fails with `ENOTDIR` for `dist/`, run
  `npm run package:prepare-output`, then rerun `npm run package:vsix`. The
  expected package file is `dist/quantumlang-0.1.0.vsix`.
- Install with `code --install-extension dist/quantumlang-0.1.0.vsix`.
- Set `quantumlang.qtlcPath` to an absolute `qtlc` path first, especially on
  macOS and Windows.
- On Linux, confirm the configured path is executable.
- On Windows, include the `.exe` suffix when using an absolute path.
- Open `QuantumLang: Show Server Output` and confirm the command shown after
  `qtlc server started:` matches the configured path.
- Run `QuantumLang: Preflight` and confirm the active qtlc path, server
  version, package root, package target, and cache health match expectation.
- Run `QuantumLang: Restart Language Server` after changing the path.

## Marketplace Preview Problems

Q80 marks the extension as a marketplace preview package and uses the MIT
license for the VS Code adapter package.

Common fixes:

- Run `npm run package:release-check` and fix metadata failures before
  packaging.
- Run `npm run smoke:vsix` after `npm install` to build a `.vsix` and install it
  when the VS Code `code` CLI is available.
- Confirm `LICENSE.md` says `MIT License` and `package.json` has
  `"license": "MIT"`.
- Keep screenshots out of release notes until `release-assets/README.md`
  approval is complete.

If CI packaging fails:

- Check that `.gitlab/ci/qtlc-vscode-vsix.yml` is included by the project
  pipeline.
- Confirm the job has network access for `npm ci`.
- Confirm `README.md`, `CHANGELOG.md`, `LICENSE.md`, and `image/logo.png` are
  present and not excluded by `.vscodeignore`.

## Cross-Platform Path Notes

- `${workspaceFolder}` is expanded before launching `qtlc server`.
- Backslashes are accepted in workspace settings for Windows paths.
- App-launched VS Code on macOS often has a smaller `PATH` than your shell, so
  absolute paths are more reliable for installed extension smoke.
- In multi-root workspaces, run `QuantumLang: Select Package Root` before
  testing build/run/cache commands.

## Preflight Problems

`QuantumLang: Preflight` runs `qtlc --version` and asks `qtlc server` for cache
summary facts.

Common fixes:

- If version is unavailable, set `quantumlang.qtlcPath` to an absolute `qtlc`
  path and run `QuantumLang: Restart Language Server`.
- If package root is wrong, run `QuantumLang: Select Package Root`.
- If package target is wrong, update `quantumlang.packageTarget`.
- If cache health looks stale, run `QuantumLang: Cache Dashboard` and clear the
  current package cache.

## File Icon Problems

The extension contributes `QuantumLang QN Icons` for `.qn` files.

Common fixes:

- Run `Preferences: File Icon Theme` and select `QuantumLang QN Icons`.
- If another icon theme is active, `.qn` files can keep showing that theme's
  default document icon. VS Code uses one active file icon theme at a time.
- Confirm `file-icons/quantumlang-icon-theme.json` is included in the package.
- Confirm `image/qn-file-dark.svg` and `image/qn-file-light.svg` exist.

## Missing Hover, Completion, Or Code Actions

These features should come from `qtlc server`.

Common fixes:

- Confirm diagnostics are appearing first; diagnostics prove the server sees the
  document.
- Enable `quantumlang.traceProtocol` and check the output channel for requests.
- Make sure the file language mode is `QuantumLang`.

## Formatting And Rename

Formatting and rename are owned by `qtlc server`. The extension registers the
editor features and applies returned edits, but it does not format QuantumLang
source or compute rename edits itself. Range formatting and prepare-rename are
also forwarded to the server, so selection formatting and rename validation use
the same checked-source state as hover, completion, diagnostics, and code
actions. Public rename preview is resolved through `codeAction/resolve` and
then applied by the extension as a normal workspace edit.

Expected current behavior:

- If formatting returns no edits, the server may already consider the source
  formatted.
- If range formatting returns no edits, check that the selected range maps to a
  valid QuantumLang source range.
- Check `quantumlang.format.trimTrailingWhitespace` and
  `quantumlang.format.ensureFinalNewline` if formatting behavior looks
  surprising.
- Prepare-rename can fail when the cursor is not on a renameable symbol.
- Unsafe public renames can be rejected with diagnostics instead of edits.
- No compiler logic is implemented in TypeScript.

## Cache Tool Problems

The cache commands are thin wrappers over `qtlc server` methods:

- `QuantumLang: Cache Dashboard` opens a quick-pick for summary, clear-cache,
  restart, and output actions.
- `QuantumLang: Cache Summary` sends `qtlc/cacheSummary`.
- `QuantumLang: Clear Current Package Cache` sends `qtlc/cacheClear` with
  `cache: "all"` for the selected package root.
- `QuantumLang: Clear Code-Action Cache` sends `qtlc/cacheClear` with
  `cache: "code-actions"` for the selected package root.

If cache output looks wrong:

- Run `QuantumLang: Select Package Root` and confirm the selected root matches
  the package you are editing.
- Check the selected `quantumlang.packageTarget`; cache output and dashboard
  details include the target used by editor requests.
- Hover over the QTLC status bar item to see recent memory-pressure notification
  count.
- Run `QuantumLang: Show Server Output` and look for `memory-pressure` or
  `trace` lines.
- Enable `quantumlang.traceProtocol` and repeat the cache command.
- Run `QuantumLang: Restart Language Server` if the server process has stale state
  or already exited.
