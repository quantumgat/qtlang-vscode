const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const dist = path.join(root, "dist");
const vsixName = `${packageJson.name}-${packageJson.version}.vsix`;
const vsixPath = path.join(dist, vsixName);

if (fs.existsSync(dist)) {
  const stat = fs.statSync(dist);
  if (stat.isFile()) {
    const tmp = path.join(root, ".dist-recovered");
    if (fs.existsSync(tmp)) {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    fs.mkdirSync(tmp);
    fs.renameSync(dist, path.join(tmp, vsixName));
    fs.renameSync(tmp, dist);
    console.log(`package:prepare-output recovered previous VSIX file as dist/${vsixName}`);
  } else if (!stat.isDirectory()) {
    throw new Error("dist exists but is neither a file nor a directory");
  }
} else {
  fs.mkdirSync(dist);
}

if (fs.existsSync(vsixPath)) {
  fs.rmSync(vsixPath);
}

console.log(`package:prepare-output ready: dist/${vsixName}`);
