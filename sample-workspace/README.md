# QuantumLang IDE Sample Workspace

Open this folder in the VS Code extension host to test the thin QuantumLang
adapter.

This sample also works when the larger repository is open. The extension routes
each `.qn` document to the nearest parent `quantum.toml`, so files under this
folder use this sample package instead of the outer repository root.

Useful manual edits:

- Remove `import math::{add}` from `src/main.qn` to trigger a missing import
  diagnostic and quick fix.
- Change `add(40, 2)` to `missing(40, 2)` to trigger an unknown identifier
  diagnostic.
- Hover over `add` or use go-to-definition to verify editor requests travel
  through `qtlc server`.
