# QuantumLang Installed Extension Smoke Workspace

This workspace is intentionally independent from repo-relative `qtlc` paths.
Use it after installing the `.vsix` into a normal VS Code profile.

## Steps

1. Build or install `qtlc` somewhere stable.
2. Open this `installed-smoke-workspace` folder in VS Code.
3. Set `quantumlang.qtlcPath` to the absolute `qtlc` path.
4. Run `QuantumLang: Restart Language Server`.
5. Run `QuantumLang: Preflight`.
6. Open `src/main.qn` and confirm diagnostics, hover, completion, and cache
   commands go through `qtlc server`.

This workspace does not include `.vscode/settings.json` on purpose. It proves
the installed extension works when the user configures `qtlcPath` directly.
