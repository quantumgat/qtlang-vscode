const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const localBin = path.join(root, "node_modules", ".bin");
const vsce = process.platform === "win32"
  ? path.join(localBin, "vsce.cmd")
  : path.join(localBin, "vsce");

function skip(message) {
  console.log(`smoke:vsix skipped: ${message}`);
  process.exit(0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) {
    console.error(`smoke:vsix failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`smoke:vsix ${command} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(path.join(root, "node_modules"))) {
  skip("node_modules is not installed; run npm install first");
}
if (!fs.existsSync(vsce)) {
  skip("@vscode/vsce is not installed; run npm install first");
}

run("npm", ["run", "package:vsix"]);

const dist = path.join(root, "dist");
const vsix = fs.existsSync(dist)
  ? fs.readdirSync(dist).find((name) => name.endsWith(".vsix"))
  : undefined;
if (!vsix) {
  console.error("smoke:vsix did not find a generated .vsix in dist/");
  process.exit(1);
}

const codeCheck = spawnSync("code", ["--version"], {
  stdio: "ignore",
  shell: false,
});
if (codeCheck.error || codeCheck.status !== 0) {
  console.log(`smoke:vsix package generated: dist/${vsix}`);
  skip("VS Code CLI 'code' is unavailable; install smoke not run");
}

run("code", ["--install-extension", path.join("dist", vsix), "--force"]);
console.log(`smoke:vsix installed dist/${vsix}`);
