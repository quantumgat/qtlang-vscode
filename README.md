# QuantumLang for VS Code

Official QuantumLang language support by **Quantum Technology**.

This extension keeps VS Code integration thin and reliable. It launches the
`qtlc` compiler in language-server mode, forwards editor requests, and displays
the results. Parsing, diagnostics, semantic analysis, formatting, rename, code
actions, package routing, and cache ownership remain inside `qtlc`.

## Features

- Syntax highlighting for `.qn` files.
- `.qn` language/page icons without replacing the user's active file icon
  theme.
- Diagnostics from `qtlc server`.
- Hover, go-to-definition, and completion.
- Document symbols and semantic-token support.
- Code actions and code-action resolve for import fixes and rename preview.
- Formatting, range formatting, prepare-rename, and rename.
- Build and run commands that call the configured `qtlc` binary.
- Package-root and target selection for multi-root workspaces.
- Preflight and cache-dashboard commands for troubleshooting.

## Requirements

Install `qtlc` before using the extension. The extension does not bundle the
compiler.

Recommended Linux install path:

```sh
sudo ./qtlc/scripts/install-system.sh
qtlc --version
```

The default extension setting is:

```json
"quantumlang.qtlcPath": "qtlc"
```

If `qtlc` is not on `PATH`, set `quantumlang.qtlcPath` to an absolute binary
path. On Linux this is often `/usr/local/bin/qtlc`.

## Quick Start

1. Install or build `qtlc`.
2. Open a folder with `quantum.toml` or a `.qn` file.
3. Run `QuantumLang: Preflight`.
4. Run `QuantumLang: Restart Language Server`.
5. Open a `.qn` file and check diagnostics, hover, and completion.

For installed-extension smoke testing, use:

```text
installed-smoke-workspace/
```

That workspace has no repo-relative settings, so it proves the installed
extension can find an installed compiler.

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

Build and run commands open VS Code terminals in the selected package root and
call the configured `quantumlang.qtlcPath`.

## Settings

```json
{
  "quantumlang.qtlcPath": "qtlc",
  "quantumlang.packageTarget": "app",
  "quantumlang.traceProtocol": false,
  "quantumlang.format.trimTrailingWhitespace": true,
  "quantumlang.format.ensureFinalNewline": true
}
```

`quantumlang.qtlcPath` supports absolute paths and `${workspaceFolder}`.

`quantumlang.packageTarget` selects the package target used by editor queries
when a package has more than one target.

`quantumlang.traceProtocol` asks the server for compact protocol traces while
debugging editor integration.

## Language Server Boundary

```text
VS Code extension
  -> qtlc server process
  -> newline-delimited JSON-RPC requests
  -> compiler query and code-action products
  -> JSON-RPC responses and publishDiagnostics notifications
```

The TypeScript extension owns editor transport only:

- start, stop, and restart `qtlc server`
- send document lifecycle messages
- forward hover, definition, completion, formatting, rename, and code-action
  requests
- display diagnostics and workspace edits returned by the server
- show status, preflight, cache, and server-output UI

Compiler behavior stays in `qtlc`.

## Syntax Highlighting

The extension contributes a TextMate grammar at:

```text
syntaxes/quantumlang.tmLanguage.json
```

It provides stable scopes for keywords, imports, function declarations,
function calls, primitive types, strings, numbers, comments, operators, and
punctuation. The active VS Code color theme controls the final colors.

## File Icons

The extension contributes light and dark icons on the `quantumlang` language
registration. They are intended as `.qn` language/page icons:

```text
image/qn-file-dark.svg
image/qn-file-light.svg
```

The extension does not contribute a full VS Code file-icon theme, because VS
Code allows only one active Explorer icon theme at a time. Shipping a complete
QuantumLang icon theme would replace the user's Material/Icon Set/Codicons
theme and make other file icons disappear.

If the active file-icon theme supports language icons or has no mapping for
`.qn`, VS Code can show the QuantumLang icon for `.qn` files. If the active
file-icon theme overrides unknown files with its own default document icon,
`.qn` files may use that theme's default until the theme itself adds a
QuantumLang mapping.

## Package Routing

Editor requests use the nearest parent `quantum.toml` for the active `.qn`
document. This keeps nested sample projects and multi-root workspaces routed to
the correct package root.

The selected package root is persisted in workspace state. The selected package
target appears in the status bar and in hover/status details so it is clear
which compiler context answered a request.

## Local Development

From the repository root:

```sh
cmake --build qtlc/build
cd qtlc/ide/vscode
npm install
npm run compile
```

Open `qtlc/ide/vscode` in VS Code and run the `Run QuantumLang Extension`
launch configuration. It opens the bundled sample workspace:

```text
sample-workspace/
```

The sample workspace contains:

```text
quantum.toml
src/main.qn
src/math.qn
```

Use it to test diagnostics, hover, go-to-definition, completion, formatting,
rename, and code actions without touching compiler fixtures.

## Protocol Smoke

After `npm install`, run:

```sh
npm run smoke:protocol
```

Set `QTLC_PATH=/absolute/path/to/qtlc` if the default built binary path is not
correct. If `node_modules/` is not present, the smoke exits as skipped so C++
test flows do not require Node dependencies.

## Packaging

Build and inspect an installable `.vsix` package:

```sh
cd qtlc/ide/vscode
npm install
npm run package:check
npm run package:vsix
```

Release metadata can be checked without building the full package:

```sh
npm run package:release-check
```

The package is written to:

```text
dist/quantumlang-0.1.0.vsix
```

Packaging uses:

```sh
vsce package --no-dependencies
```

The extension is a transport adapter and does not bundle compiler/runtime
logic. Users install `qtlc` separately.

Release packages keep the public project documents visible in the VSIX:
`README.md`, `CHANGELOG.md`, and `LICENSE.md`.

If a previous packaging run accidentally created a file named `dist`, run:

```sh
npm run package:prepare-output
npm run package:vsix
```

The standalone extension `.gitignore` keeps `node_modules/`, `out/`, `dist/`,
local `.vsix` packages, extension-host test folders, logs, coverage, and local
editor state out of the `qtlang-vscode` repository.

The `.vscodeignore` file keeps source, sample workspaces, local launch files,
installed dependencies, and development-only scripts out of the packaged
extension.

## Install Local VSIX

```sh
code --install-extension dist/quantumlang-0.1.0.vsix --force
```

Then run:

```text
Developer: Reload Window
QuantumLang: Restart Language Server
```

## VSIX Smoke

When Node dependencies and the VS Code CLI are available:

```sh
npm run smoke:vsix
```

The smoke builds the `.vsix`, checks that `dist/*.vsix` exists, and installs it
with `code --install-extension`. If the VS Code CLI is missing, it reports a
clean skip.

## Platform Notes

- Linux: `qtlc` on `PATH` or an absolute path such as `/usr/local/bin/qtlc`
  should launch directly.
- macOS: VS Code launched from Finder may not inherit shell `PATH`; prefer an
  absolute `quantumlang.qtlcPath`.
- Windows: use `C:\\path\\to\\qtlc.exe` or
  `${workspaceFolder}\\path\\to\\qtlc.exe`.

## Preflight

`QuantumLang: Preflight` writes an operational report to the QuantumLang output
channel:

- configured `quantumlang.qtlcPath`
- expanded active `qtlc` path
- `qtlc --version`
- selected package root
- selected package target
- checked-source cache health
- code-action cache health
- source snapshot counts and bytes
- recent memory-pressure notification count

## Cache Tools

Cache tools are UI wrappers over server-owned debug methods:

- `QuantumLang: Cache Dashboard`
- `QuantumLang: Cache Summary`
- `QuantumLang: Clear Current Package Cache`
- `QuantumLang: Clear Code-Action Cache`

The extension only displays returned facts. Cache ownership and eviction
decisions stay inside `qtlc server`.

## Formatting And Rename

Formatting and rename are server-owned features. The extension forwards VS Code
requests and applies returned edits. It does not format source or compute
rename edits in TypeScript.

Supported paths:

- document formatting
- range formatting
- prepare-rename validation
- rename workspace edits
- public rename preview through `codeAction/resolve`

Formatting settings:

```json
{
  "quantumlang.format.trimTrailingWhitespace": true,
  "quantumlang.format.ensureFinalNewline": true
}
```

## Marketplace Metadata

Public extension identity:

```text
Company:      Quantum Technology
Repository:   https://github.com/quantumgat/qtlang-vscode
Package:      quantumlang
Display name: QuantumLang
Publisher:    quantumtechnology
License:      MIT
```

Marketplace metadata:

- package name: `quantumlang`
- display name: `QuantumLang`
- publisher: `quantumtechnology`
- company: `Quantum Technology`
- license: `MIT`
- Q&A disabled, with support routed to project issues
- dark QuantumLang gallery banner
- GitHub packaging workflow badge
- workspace extension kind

Screenshots and demo assets must be approved before they are referenced from
marketplace release notes. See `release-assets/README.md`.

## Optional CI Packaging

The optional GitLab CI packaging job lives at:

```text
.gitlab/ci/qtlc-vscode-vsix.yml
```

The job installs Node dependencies, runs `npm run package:check`, builds the
`.vsix`, and publishes `dist/*.vsix` as short-lived CI artifacts.

## Versioned Settings

Versioned setting migration notes live in:

```text
MIGRATIONS.md
```

Update `MIGRATIONS.md`, `CHANGELOG.md`, and the manual smoke checklist when a
release changes installed-user settings or command behavior.

## Troubleshooting

For common setup, path, server-start, packaging, cache, formatting, and rename
problems, see:

```text
TROUBLESHOOTING.md
```
