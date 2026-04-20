const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function fail(message) {
  console.error(`package-check: ${message}`);
  process.exitCode = 1;
}

function requireFile(relativePath) {
  if (!exists(relativePath)) {
    fail(`missing ${relativePath}`);
  }
}

function requireText(relativePath, text) {
  if (!read(relativePath).includes(text)) {
    fail(`${relativePath} is missing ${text}`);
  }
}

requireFile("README.md");
requireFile("CHANGELOG.md");
requireFile("LICENSE.md");
requireFile("MIGRATIONS.md");
requireFile(".gitignore");
requireFile(".vscodeignore");
requireFile("language-configuration.json");
requireFile("syntaxes/quantumlang.tmLanguage.json");
requireFile("image/logo.png");
requireFile("image/icon-dark.png");
requireFile("image/icon-light.png");
requireFile("image/qn-file-dark.svg");
requireFile("image/qn-file-light.svg");
requireFile("file-icons/quantumlang-icon-theme.json");
requireFile("installed-smoke-workspace/README.md");
requireFile("installed-smoke-workspace/quantum.toml");
requireFile("installed-smoke-workspace/src/main.qn");
requireFile("release-assets/README.md");

const packageJson = JSON.parse(read("package.json"));
if (packageJson.name !== "quantumlang") {
  fail("package.json name must be quantumlang for public QuantumLang publishing");
}
if (packageJson.displayName !== "QuantumLang") {
  fail("package.json displayName must be QuantumLang");
}
if (packageJson.publisher !== "quantumtechnology") {
  fail("package.json publisher must be quantumtechnology for Quantum Technology");
}
if (!packageJson.description?.includes("Quantum Technology")) {
  fail("package.json description must mention Quantum Technology");
}
if (!packageJson.repository?.url ||
    packageJson.repository.url.includes("example.invalid")) {
  fail("package.json repository.url must be a real project URL");
}
if (!packageJson.homepage || packageJson.homepage.includes("example.invalid")) {
  fail("package.json homepage must be a real project URL");
}
if (!packageJson.bugs?.url || packageJson.bugs.url.includes("example.invalid")) {
  fail("package.json bugs.url must be a real project URL");
}
if (!packageJson.icon || !exists(packageJson.icon)) {
  fail("package.json icon must point to a packaged icon");
}
if (!packageJson.license) {
  fail("package.json must declare a license");
}
if (packageJson.license !== "MIT") {
  fail("package.json license must match the Q80 public license decision: MIT");
}
if (!packageJson.galleryBanner?.color ||
    !packageJson.galleryBanner?.theme) {
  fail("package.json must declare marketplace galleryBanner metadata");
}
if (packageJson.qna !== false) {
  fail("package.json qna must be false while support stays in project issues");
}
if (packageJson.preview !== true) {
  fail("package.json preview must be true for the first marketplace preview");
}
if (!Array.isArray(packageJson.badges) || packageJson.badges.length === 0) {
  fail("package.json must declare at least one marketplace badge");
}
if (!Array.isArray(packageJson.extensionKind) ||
    !packageJson.extensionKind.includes("workspace")) {
  fail("package.json must declare workspace extensionKind");
}
if (!packageJson.scripts?.["package:vsix"] ||
    !packageJson.scripts?.["package:prepare-output"] ||
    !packageJson.scripts?.["package:check"] ||
    !packageJson.scripts?.["package:release-check"] ||
    !packageJson.scripts?.["smoke:vsix"]) {
  fail("package.json must expose package:release-check/package:check/package:prepare-output/package:vsix/smoke:vsix scripts");
}

requireText("README.md", "Packaging");
requireText("README.md", "dist/quantumlang-0.1.0.vsix");
requireText("README.md", "publisher: `quantumtechnology`");
requireText("README.md", "company: `Quantum Technology`");
requireText("README.md", "package:prepare-output");
requireText("README.md", "vsce package --no-dependencies");
requireText("README.md", "Preferences: File Icon Theme");
requireText("README.md", "one active file icon theme");
requireText("README.md", "Installed Extension Smoke");
requireText("README.md", "Platform Compatibility Checklist");
requireText("README.md", "QuantumLang: Preflight");
requireText("CHANGELOG.md", packageJson.version);
requireText("LICENSE.md", "MIT License");
requireText("MIGRATIONS.md", packageJson.version);
requireText(".gitignore", "QuantumLang VS Code extension local files");
requireText(".gitignore", "node_modules/");
requireText(".gitignore", "dist/");
requireText(".gitignore", "out/");
requireText(".gitignore", "*.vsix");
requireText("file-icons/quantumlang-icon-theme.json", "qn-file-dark.svg");
requireText("file-icons/quantumlang-icon-theme.json", "qn-file-light.svg");
const languageContribution = JSON.stringify(packageJson.contributes?.languages ?? []);
if (!languageContribution.includes("\"icon\"") ||
    !languageContribution.includes("qn-file-dark.svg") ||
    !languageContribution.includes("qn-file-light.svg")) {
  fail("package.json language contribution must declare light/dark QuantumLang icons");
}
const grammarContribution = JSON.stringify(packageJson.contributes?.grammars ?? []);
if (!grammarContribution.includes("source.quantumlang") ||
    !grammarContribution.includes("syntaxes/quantumlang.tmLanguage.json")) {
  fail("package.json must contribute the QuantumLang TextMate grammar");
}
requireText("syntaxes/quantumlang.tmLanguage.json", "source.quantumlang");
requireText("syntaxes/quantumlang.tmLanguage.json", "keyword.declaration.function.quantumlang");
requireText("syntaxes/quantumlang.tmLanguage.json", "keyword.control.import.quantumlang");
requireText("syntaxes/quantumlang.tmLanguage.json", "entity.name.function.call.quantumlang");
requireFile("scripts/vsix-smoke.js");
requireFile("scripts/prepare-vsix-output.js");
requireText("scripts/vsix-smoke.js", "smoke:vsix");
requireText("scripts/prepare-vsix-output.js", "recovered previous VSIX file");
requireText("scripts/prepare-vsix-output.js", "packageJson.name");
requireText("scripts/prepare-vsix-output.js", "dist/");
requireText("release-assets/README.md", "Screenshot Approval");

if (!packageJson.scripts["package:vsix"].includes("--no-dependencies") ||
    !packageJson.scripts["package:vsix"].includes("dist/quantumlang-0.1.0.vsix")) {
  fail("package:vsix must package without dependencies to the explicit VSIX output path");
}

const ignore = read(".vscodeignore");
for (const required of [
  "node_modules/**",
  "src/**",
  "sample-workspace/**",
  "installed-smoke-workspace/**",
  "release-assets/**",
  "dist/**",
]) {
  if (!ignore.includes(required)) {
    fail(`.vscodeignore is missing ${required}`);
  }
}

for (const forbidden of ["README.md", "CHANGELOG.md", "LICENSE.md"]) {
  if (ignore.split(/\r?\n/).includes(forbidden)) {
    fail(`.vscodeignore must not exclude ${forbidden}`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("package-check: release packaging metadata is ready");
