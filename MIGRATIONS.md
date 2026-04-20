# QuantumLang for VS Code Settings Migrations

This file records user-visible settings changes for installed extension
upgrades.

## 0.1.0

Initial installable preview.

- Extension package identity is `quantumlang` with publisher
  `quantumtechnology`.
- `quantumlang.qtlcPath` defaults to `qtlc`.
- `quantumlang.packageTarget` defaults to `app`.
- `quantumlang.traceProtocol` defaults to `false`.
- `quantumlang.format.trimTrailingWhitespace` defaults to `true`.
- `quantumlang.format.ensureFinalNewline` defaults to `true`.

Recommended migration from extension-host testing:

1. Replace repo-relative `quantumlang.qtlcPath` values with an installed or
   absolute `qtlc` path.
2. Run `QuantumLang: Preflight`.
3. Confirm the preflight reports the expected server version, package root,
   package target, and cache health.

## Future Version Rule

Every settings rename, default change, or behavior-changing setting migration
must add a new version section here and update `CHANGELOG.md`.
