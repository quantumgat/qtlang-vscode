# QuantumLang for VS Code Changelog

## 0.1.0

Initial local `.vsix` packaging release for the thin QuantumLang editor
adapter by Quantum Technology.

- Starts `qtlc server` and keeps compiler behavior out of TypeScript.
- Supports diagnostics, hover, definition, completion, code actions,
  formatting, rename, cache tools, and server restart commands.
- Adds installed-extension smoke steps for workspaces outside the source tree.
- Adds Linux, macOS, and Windows path compatibility notes for
  `quantumlang.qtlcPath`.
- Adds `QuantumLang: Preflight` for operational checks before support reports.
- Adds versioned settings migration notes in `MIGRATIONS.md`.
- Adds a standalone installed-extension smoke workspace without repo-relative
  settings.
- Adds the `QuantumLang QN Icons` file icon theme for `.qn` files using the
  dark/light icons in `image/`.
- Switches the VS Code adapter package to the MIT license for marketplace
  preview packaging.
- Adds marketplace preview metadata, gallery banner, support routing, and a
  VSIX smoke script that builds and installs when local Node and VS Code CLI
  tooling are available.
- Keeps screenshots approval-gated through `release-assets/README.md`.
- Renames the public extension package to `quantumlang`, display name
  `QuantumLang`, publisher `quantumtechnology`.

## Release Discipline

Every packaged release must update this file, keep `README.md` and
`LICENSE.md` package-visible, and run:

```sh
npm run package:check
```
