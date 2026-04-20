#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const extensionRoot = path.resolve(__dirname, "..");
const nodeModules = path.join(extensionRoot, "node_modules");
if (!fs.existsSync(nodeModules)) {
  console.log("skip: run `npm install` in qtlc/ide/vscode before protocol smoke");
  process.exit(0);
}

const qtlcPath =
  process.env.QTLC_PATH ||
  path.resolve(extensionRoot, "../../build/compiler/driver/qtlc");
if (!fs.existsSync(qtlcPath)) {
  console.error(`missing qtlc binary: ${qtlcPath}`);
  console.error("build it first with: cmake --build qtlc/build");
  process.exit(1);
}

const workspaceRoot = path.join(extensionRoot, "sample-workspace");
const mainPath = path.join(workspaceRoot, "src/main.qn");
const mainUri = `file://${mainPath}`;

const server = spawn(qtlcPath, ["server"], {
  cwd: workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const responses = [];
const notifications = [];
let failed = false;

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

function finish(code) {
  if (server.exitCode === null) {
    server.kill();
  }
  process.exit(code);
}

function requireMessage(condition, message) {
  if (!condition) {
    console.error(message);
    failed = true;
  }
}

server.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

server.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  while (true) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) {
      break;
    }
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line.length === 0) {
      continue;
    }
    const message = JSON.parse(line);
    if (message.method) {
      notifications.push(message);
    } else {
      responses.push(message);
    }
  }
});

server.on("error", (error) => {
  console.error(error.message);
  finish(1);
});

server.on("spawn", () => {
  send({
    jsonrpc: "2.0",
    id: "init",
    method: "initialize",
    params: {
      rootPath: workspaceRoot,
      qtlcTrace: true,
    },
  });
  send({
    jsonrpc: "2.0",
    id: "open-invalid",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: mainUri,
        version: 1,
        text: "fn main() -> i64 { return @ }",
      },
    },
  });
  send({
    jsonrpc: "2.0",
    id: "change-valid",
    method: "textDocument/didChange",
    params: {
      textDocument: {
        uri: mainUri,
        version: 2,
      },
      contentChanges: [
        {
          text: fs.readFileSync(mainPath, "utf8"),
        },
      ],
    },
  });
  send({
    jsonrpc: "2.0",
    id: "hover-add",
    method: "textDocument/hover",
    params: {
      textDocument: {
        uri: mainUri,
      },
      position: {
        line: 3,
        character: 9,
      },
      qtlcTrace: true,
    },
  });
  send({
    jsonrpc: "2.0",
    id: "cache-summary",
    method: "qtlc/cacheSummary",
    params: {
      packageRoot: workspaceRoot,
      qtlcTrace: true,
    },
  });
  send({
    jsonrpc: "2.0",
    id: "clear-actions",
    method: "qtlc/cacheClear",
    params: {
      packageRoot: workspaceRoot,
      cache: "code-actions",
      qtlcTrace: true,
    },
  });
  server.stdin.end();
});

setTimeout(() => {
  requireMessage(
    responses.some((message) => message.id === "init"),
    "initialize response was not received",
  );
  requireMessage(
    responses.some((message) => message.id === "hover-add"),
    "hover response was not received",
  );
  requireMessage(
    responses.some((message) => message.id === "cache-summary"),
    "cache summary response was not received",
  );
  requireMessage(
    responses.some((message) => message.id === "clear-actions"),
    "cache clear response was not received",
  );
  requireMessage(
    notifications.some(
      (message) => message.method === "textDocument/publishDiagnostics",
    ),
    "publishDiagnostics notification was not received",
  );
  requireMessage(
    notifications.some((message) => message.method === "$/qtlc/protocolTrace"),
    "protocolTrace notification was not received",
  );
  if (failed) {
    finish(1);
  }
  console.log("qtlc IDE protocol smoke passed");
  finish(0);
}, 800);
