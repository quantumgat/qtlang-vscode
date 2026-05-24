# Q77 Manual IDE Smoke Checklist

Use this checklist after building `qtlc`, compiling the VS Code adapter, or
installing the generated `.vsix`.

## Setup

1. Build the compiler:

   ```sh
   cmake --build qtlc/build
   ```

2. Compile the extension:

   ```sh
   cd qtlc/ide/vscode
   npm install
   npm run compile
   ```

3. Open `qtlc/ide/vscode` in VS Code.
4. Run the `Run QuantumLang Extension` launch configuration.
5. Confirm the extension host opens `sample-workspace`.
6. Confirm editor diagnostics use the nearest parent `quantum.toml` for
   `sample-workspace/src/main.qn`, even when the larger repository is open.
7. Confirm `fn`, `import`, `return`, function names, primitive types, numbers,
   and punctuation have theme-aware syntax highlighting in `.qn` files.
8. The checked-in sample workspace setting should point at:

   ```text
   ${workspaceFolder}/../../../build/compiler/driver/qtlc
   ```

   Override `quantumlang.qtlcPath` if your build output is somewhere else.

## Installable Package Smoke

1. Build the local `.vsix`:

   ```sh
   cd qtlc/ide/vscode
   npm install
   npm run package:release-check
   npm run package:check
   npm run package:vsix
   ```

   If a previous packaging attempt created a file named `dist`, run
   `npm run package:prepare-output` once and rerun `npm run package:vsix`.
   The expected Quantum Technology package path is
   `dist/quantumlang-0.1.0.vsix`.

2. Install it into a normal VS Code profile:

   ```sh
   code --install-extension dist/quantumlang-0.1.0.vsix
   
   or

   code --install-extension dist/quantumlang-0.1.0.vsix --force
   ```

3. Open a workspace outside `qtlc/ide/vscode`.
4. Set `quantumlang.qtlcPath` to an installed or built `qtlc` binary.
5. Run `QuantumLang: Restart Language Server`.
6. Run `QuantumLang: Preflight` and confirm it reports the `qtlcPath`, server
   version, package root, package target, and cache health.
7. Open `QuantumLang: Show Server Output` and confirm the installed extension
   starts `qtlc server`.
8. Run `QuantumLang: Cache Dashboard` and confirm it returns server cache facts.
9. Open `qtlc/ide/vscode/installed-smoke-workspace` and repeat the smoke with
   an absolute `quantumlang.qtlcPath`; this workspace has no repo-relative
   settings by design.

## VSIX Install Smoke

After `npm install`, run:

```sh
npm run smoke:vsix
```

Pass criteria:

- If Node dependencies are missing, the smoke reports skipped.
- If VS Code CLI is missing, the smoke builds `dist/*.vsix` and reports skipped
  for the install part.
- If both are present, the smoke builds and installs the `.vsix` with
  `code --install-extension`.

## Platform Path Checks

- Linux: test an absolute path like `/home/user/bin/qtlc` and a
  `${workspaceFolder}/.../qtlc` setting.
- macOS: test an absolute path because VS Code may not inherit shell `PATH`.
- Windows: test `C:\\path\\to\\qtlc.exe` and
  `${workspaceFolder}\\path\\to\\qtlc.exe`.
- All platforms: after changing `quantumlang.qtlcPath`, run
  `QuantumLang: Restart Language Server` and inspect the output channel.

## File Icon Check

1. Install the `.vsix`.
2. Open a `.qn` file and confirm the language mode is `QuantumLang`.
3. Confirm this does not require switching the global VS Code file icon theme.
4. Confirm existing project icons from other icon themes remain intact.
5. Confirm `.qn` files can use `image/qn-file-dark.svg` on dark themes and
   `image/qn-file-light.svg` on light themes.
6. If a third-party icon theme overrides unknown files, `.qn` files may show
   that theme's default document icon until the theme adds a QuantumLang
   mapping.

## Migration And Release Asset Check

1. Confirm `MIGRATIONS.md` has a section for the package version.
2. Confirm `CHANGELOG.md` mentions user-facing setting changes.
3. Confirm `LICENSE.md` contains the Q80 MIT license decision for the VS Code
   adapter package.
4. Optional: capture screenshots listed in `release-assets/README.md` for
   release notes only after approval.

## Optional CI Package Check

1. Include `.gitlab/ci/qtlc-vscode-vsix.yml` from a GitLab pipeline.
2. Trigger the manual `qtlc:vscode:vsix` job after changing files under
   `qtlc/ide/vscode/`.
3. Confirm the job runs `npm run package:check`, builds the `.vsix`, and stores
   `qtlc/ide/vscode/dist/*.vsix` as an artifact.

## Optional Protocol Smoke

After `npm install`, run:

```sh
npm run smoke:protocol
```

The smoke starts `qtlc server`, sends `initialize`, `didOpen`, `didChange`, and
hover requests, and checks for diagnostics plus compact protocol traces. It
skips when `node_modules/` is not present.

## Protocol Checks

1. Open a workspace containing `quantum.toml`.
2. Open a `.qn` file.
3. Confirm the extension starts `qtlc server`.
4. Confirm the QTLC status bar item shows the active package root.
5. Confirm `initialize` is sent once per server process.
6. Confirm `textDocument/didOpen` is sent for the opened `.qn` file.
7. Introduce a syntax or type error and confirm diagnostics appear.
8. Confirm the QTLC status bar diagnostic count changes.
9. Fix the error and confirm diagnostics clear after `didChange`.
10. Hover over a function name and confirm hover content appears.
11. Use go-to-definition on a local or imported function.
12. Trigger completion near an import/module path or callable position.
13. Trigger code actions on a missing import diagnostic.
14. Apply or resolve a code action and confirm the workspace edit is applied.
15. Run `QuantumLang: Build` and confirm a terminal calls `qtlc build`.
16. Run `QuantumLang: Run` and confirm a terminal calls `qtlc run`.
17. Use `QuantumLang: Select Package Root` in a multi-root workspace.
18. Change `quantumlang.traceProtocol` and confirm the server restarts without
    restarting VS Code.
19. Run `QuantumLang: Show Server Output` and confirm the output channel opens.
20. Run `QuantumLang: Preflight` and confirm the output channel reports
    `qtlcPath`, server version, package root, package target, and cache health.
21. Run `QuantumLang: Restart Language Server` and confirm the output channel shows
    a manual restart without changing settings.
22. Run `QuantumLang: Cache Dashboard` and confirm the quick-pick shows summary,
    clear-cache, restart, and output actions with the selected package target.
23. Run `QuantumLang: Cache Summary` and confirm checked-source, code-action,
    snapshot, and recent memory-pressure facts appear in the output channel.
24. Run `QuantumLang: Clear Current Package Cache` and confirm the output
    channel reports cleared checked-source/code-action counts.
25. Run `QuantumLang: Clear Code-Action Cache` and confirm the output channel
    reports the `code-actions` cache clear response.
26. Change `quantumlang.packageTarget` and confirm the status bar target text
    updates without restarting the server, and cache output includes the target.
27. Trigger completion after `.`, `:`, and a partially typed identifier; confirm
    responses still come from `qtlc server`.
28. Run `QuantumLang: Format Document`; formatting edits should come from
    `qtlc server`.
29. Select a small range and run `Format Selection`; range formatting edits
    should come from `qtlc server`.
30. Start rename on a known symbol and confirm Prepare Rename highlights the
    symbol range before the edit is requested.
31. Run `QuantumLang: Rename Symbol`; rename workspace edits should come from
    `qtlc server`, and unsafe public renames should be rejected by the server.
32. Hover over a symbol and confirm the footer shows the package root and target.
33. Inspect the QTLC status bar tooltip and confirm it reports recent
    memory-pressure notification count.
34. Close the file and confirm `textDocument/didClose` is sent.

## Trace Mode

Enable `quantumlang.traceProtocol` and repeat hover, diagnostics, completion,
and code-action checks. The extension should log compact
`$/qtlc/protocolTrace` notifications in the QuantumLang output channel.
If a large workspace triggers cache pressure, the output channel should also
show `memory-pressure` lines from `$/qtlc/memoryPressure`.

## Pass Criteria

- The extension never parses QuantumLang source itself.
- The extension never computes semantic facts itself.
- All editor features are forwarded to `qtlc server`.
- Diagnostics come from server `publishDiagnostics` notifications.
- Hover, definition, completion, and code actions come from server responses.
- Formatting and rename come from server responses; the extension only forwards
  requests and applies returned edits.
- Cache Summary, Clear Current Package Cache, Clear Code-Action Cache, and
  memory-pressure output are backed by `qtlc server` cache/debug responses.
- Cache Dashboard and Restart Language Server are UI/transport wrappers only; cache
  and restart behavior remain owned by the server client path.
- Preflight is a reporting command only; it reads `qtlc --version` and server
  cache facts without adding compiler behavior to the extension.
