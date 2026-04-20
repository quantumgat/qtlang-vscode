# QuantumLang for VS Code

Official QuantumLang language support by Quantum Technology.

This directory is the first minimal IDE-extension boundary for QuantumLang. It
intentionally stays thin: the extension starts `qtlc server`, forwards editor
events and requests, and renders server results. Parsing, diagnostics, semantic
analysis, package routing, code actions, and cache logic remain inside the
compiler server.

## Boundary

```text
VS Code extension
  -> qtlc server process
  -> newline-delimited JSON-RPC requests
  -> qtlc query/code-action products
  -> JSON-RPC responses and publishDiagnostics notifications
```

The extension owns only editor plumbing:

- launch and stop `qtlc server`
- show a compact QTLC status bar item
- send `initialize`
- send `textDocument/didOpen`
- send `textDocument/didChange`
- send `textDocument/didClose`
- forward hover, definition, completion, code action, and code-action resolve
- display diagnostics from `textDocument/publishDiagnostics`
- run `qtlc build` and `qtlc run` in a terminal
- select the active package root when multiple workspace folders are open
- optionally log `$/qtlc/protocolTrace`

## Local Extension Host

```sh
cmake --build qtlc/build
cd qtlc/ide/vscode
npm install
npm run compile
```

Open `qtlc/ide/vscode` in VS Code and run the `Run QuantumLang Extension`
launch configuration. It opens the bundled `sample-workspace` folder in an
extension host. The sample workspace contains `.vscode/settings.json` with this
default compiler path:

```text
${workspaceFolder}/../../../build/compiler/driver/qtlc
```

You can override it with `quantumlang.qtlcPath`. The adapter expands
`${workspaceFolder}` before launching `qtlc server`.

For daily use, install the compiler on `PATH` instead:

```sh
sudo ./qtlc/scripts/install-system.sh
qtlc --version
```

Then the extension can keep the default `quantumlang.qtlcPath` value of
`qtlc`. On Linux this installs to `/usr/local/bin/qtlc`. See
`qtlc/docs/INSTALL.md` for user-local and system install options.

## Sample Workspace

The local sample workspace lives at:

```text
qtlc/ide/vscode/sample-workspace
```

It contains a small `quantum.toml`, `src/main.qn`, and `src/math.qn`. Use it to
test diagnostics, hover, go-to-definition, completion, and code actions without
touching compiler fixtures.

Editor requests use the nearest parent `quantum.toml` for the active `.qn`
document. That keeps this sample working even when the larger repository is
open and prevents diagnostics from being routed to the wrong package root.

## Syntax Highlighting

The extension contributes a TextMate grammar at
`syntaxes/quantumlang.tmLanguage.json`. It is theme-aware and gives stable
scopes for QuantumLang keywords, imports, function declarations and calls,
primitive types, strings, numbers, comments, operators, and punctuation. Use a
quality dark or light VS Code theme to control the exact colors.

## Protocol Smoke

After `npm install`, the protocol smoke can launch `qtlc server` directly:

```sh
npm run smoke:protocol
```

Set `QTLC_PATH=/absolute/path/to/qtlc` if the default built binary path is not
correct. When `node_modules/` is not present, the smoke exits as skipped so C++
build/test flows do not need Node dependencies.

## Packaging

Build and inspect an installable `.vsix` package from this directory:

```sh
cd qtlc/ide/vscode
npm install
npm run package:check
npm run package:vsix
```

The package is written to `dist/quantumlang-0.1.0.vsix`. The
`.vscodeignore` file keeps source, sample workspaces, local launch files, and
installed dependencies out of the `.vsix`; the package carries only the
compiled adapter, metadata, language configuration, release notes, license
notice, troubleshooting docs, and icons needed by VS Code.

The standalone extension `.gitignore` keeps `node_modules/`, `out/`, `dist/`,
local `.vsix` packages, extension-host test folders, logs, coverage, and local
editor state out of the `qtlang-vscode` repository.

Packaging uses `vsce package --no-dependencies` because the extension is a thin
transport adapter and does not bundle compiler/runtime logic. If an older
packaging run accidentally created a file named `dist`, run
`npm run package:prepare-output` and then rerun `npm run package:vsix`. The
prepare step recovers that file as `dist/quantumlang-0.1.0.vsix` and
creates the real output directory expected by VS Code.

`npm run package:release-check` verifies release metadata before packaging:
real repository/homepage/bugs URLs, visible `README.md`, visible
`CHANGELOG.md`, visible `LICENSE.md`, icon presence, and package scripts.

## Marketplace Metadata

The Q80 marketplace metadata is intentionally preview-grade:

- extension package name: `quantumlang`
- display name: `QuantumLang`
- publisher: `quantumtechnology`
- company: `Quantum Technology`
- license: `MIT` for the VS Code adapter package
- marketplace preview flag: enabled
- Q&A: disabled, with support routed to project issues
- gallery banner: dark QuantumLang palette
- badge: GitHub packaging workflow status
- extension kind: workspace

Screenshots are approval-gated. Do not reference screenshots from marketplace
release notes until the files listed in `release-assets/README.md` are approved
and committed.

Install the generated package into a normal VS Code profile:

```sh
code --install-extension dist/quantumlang-0.1.0.vsix
```

Then open any workspace with `quantum.toml` or a `.qn` file and set
`quantumlang.qtlcPath` to an installed `qtlc` binary. Run
`QuantumLang: Restart Language Server`, then `QuantumLang: Show Server Output` to
confirm the installed extension can launch `qtlc server`.

## Installed Extension Smoke

Use this smoke outside the source tree after installing the `.vsix`:

1. Build or install `qtlc` somewhere stable. The recommended Linux system
   install is `sudo ./qtlc/scripts/install-system.sh`.
2. Open a separate QuantumLang workspace containing `quantum.toml`.
3. If `qtlc` is not on `PATH`, set `quantumlang.qtlcPath` to the absolute
   binary path.
4. Open a `.qn` file and confirm diagnostics appear.
5. Run `QuantumLang: Preflight` and confirm it reports `qtlcPath`, server
   version, package root, package target, and cache health.
6. Run `QuantumLang: Cache Dashboard` and confirm cache facts are returned.
7. Run `QuantumLang: Build` and confirm the terminal uses the configured path.

The standalone smoke workspace at `installed-smoke-workspace/` is designed for
installed-extension testing. It has no repo-relative `.vscode/settings.json`;
set `quantumlang.qtlcPath` yourself to prove the installed extension works
outside the source tree.

## Platform Compatibility Checklist

- Linux: absolute paths such as `/home/user/bin/qtlc` and
  `${workspaceFolder}/path/to/qtlc` should launch directly.
- macOS: app-launched VS Code may not inherit shell `PATH`; prefer an absolute
  `quantumlang.qtlcPath` for installed extension smoke.
- Windows: use either `C:\\path\\to\\qtlc.exe` or
  `${workspaceFolder}\\path\\to\\qtlc.exe`; the adapter normalizes workspace
  substitutions before spawning the server.
- All platforms: package-root selection and `quantumlang.packageTarget` should
  be visible in the QTLC status bar and hover footer.

## Settings Migrations

Versioned settings migration notes live in `MIGRATIONS.md`. Check that file
before changing defaults, renaming settings, or changing setting behavior.
After changing any installed-user setting, update `MIGRATIONS.md`,
`CHANGELOG.md`, and the manual smoke checklist.

## File Icons

The extension contributes the `QuantumLang QN Icons` file icon theme. It maps
`.qn` files and the `quantumlang` language ID to the user-provided icons:

- `image/qn-file-dark.svg` for dark themes
- `image/qn-file-light.svg` for light themes

Users can enable it from `Preferences: File Icon Theme`.

VS Code only displays Explorer icons from the currently selected file icon
theme, so there is one active file icon theme at a time. If another icon theme
is active, `.qn` files may still show that theme's
default document icon until the user selects `QuantumLang QN Icons` or that
theme adds a QuantumLang mapping. The language registration also declares
light/dark QuantumLang icons for the `quantumlang` language ID.

## Release Assets

Optional screenshot and demo asset guidance lives in `release-assets/README.md`.
Use it for release notes when screenshots are approved. The current recommended
captures are preflight output, diagnostics, cache dashboard, and `.qn` file
icons.

## Preflight

`QuantumLang: Preflight` writes one operational report to the QuantumLang output
channel:

- configured `quantumlang.qtlcPath`
- expanded active `qtlc` path
- `qtlc --version` output
- selected package root
- selected package target
- checked-source cache size and evictions
- code-action cache size and evictions
- source snapshot counts and bytes
- recent memory-pressure notification count

## Optional CI Packaging

The optional GitLab CI packaging job lives at:

```text
.gitlab/ci/qtlc-vscode-vsix.yml
```

It is intentionally not required by the C++ build. Include it from the project
pipeline when Node packaging is wanted. The job installs Node dependencies,
runs `npm run package:check`, builds the `.vsix`, and publishes `dist/*.vsix`
as short-lived CI artifacts.

## VSIX Smoke

After Node dependencies are installed, run:

```sh
npm run smoke:vsix
```

The smoke builds the `.vsix`, verifies `dist/*.vsix` exists, and installs it
with `code --install-extension` when the VS Code CLI is available. If
`node_modules` or the `code` CLI is missing, it exits as skipped so normal C++
test flows remain independent from local editor tooling.

## Commands

- `QuantumLang: Select Package Root`
- `QuantumLang: Build`
- `QuantumLang: Run`
- `QuantumLang: Show Server Output`
- `QuantumLang: Preflight`
- `QuantumLang: Restart Language Server`
- `QuantumLang: Cache Dashboard`
- `QuantumLang: Cache Summary`
- `QuantumLang: Clear Current Package Cache`
- `QuantumLang: Clear Code-Action Cache`
- `QuantumLang: Format Document`
- `QuantumLang: Rename Symbol`

The build and run commands create VS Code terminals in the selected package
root and call the configured `quantumlang.qtlcPath`.

The selected package root is persisted in workspace state. Changing
`quantumlang.qtlcPath` or `quantumlang.traceProtocol` restarts `qtlc server`
without restarting VS Code. Changing `quantumlang.packageTarget` updates editor
query routing and the status bar without restarting the server. If the server
exits unexpectedly, the adapter restarts it with a bounded exponential backoff
and writes the details to the QuantumLang output channel.
`QuantumLang: Restart Language Server` performs the same clean restart manually
without changing settings.

Cache tools are user-facing wrappers over `qtlc server` debug methods. Cache
Summary sends `qtlc/cacheSummary` and prints checked-source, code-action,
snapshot, and memory-pressure facts to the QuantumLang output channel. Clear
Current Package Cache sends `qtlc/cacheClear` with `all` for the selected
package root. Clear Code-Action Cache sends `qtlc/cacheClear` with
`code-actions`. The extension only displays the returned facts; cache ownership
and eviction decisions stay inside the compiler server. Recent
`$/qtlc/memoryPressure` notifications are also recorded in the output channel as
`memory-pressure` lines. `QuantumLang: Cache Dashboard` shows a small quick-pick
dashboard for summary, clear-cache, restart, and output actions. Cache command
details include the selected package target, and the status bar tooltip shows
the current count of recent memory-pressure notifications.

Formatting and rename are server-owned editor features. The TypeScript adapter
only forwards VS Code requests to `qtlc server` and applies returned edits; it
does not format source or compute rename edits itself. Document formatting,
range formatting, prepare-rename validation, and rename workspace edits all use
the same server protocol path. Public rename preview is resolved through
`codeAction/resolve`, then applied as a normal workspace edit when the user
chooses `Apply Preview`.

Formatting can be tuned with:

- `quantumlang.format.trimTrailingWhitespace`
- `quantumlang.format.ensureFinalNewline`

The hover footer and status bar show the selected package root and package
target so it is clear which compiler context is answering editor requests.

## Optional Local Smoke

When dependencies are installed, this command compiles the TypeScript adapter
and runs the protocol smoke:

```sh
npm run smoke:local
```

## Current Scope

This is a Quantum Technology marketplace-preview scaffold. It is ready for
local `.vsix` packaging once Node dependencies are installed, but the final
marketplace publication still needs approved screenshots and a real install
smoke in a clean VS Code profile.

For common setup and server-start problems, see `TROUBLESHOOTING.md`.
