import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as vscode from "vscode";
import {
  JsonRpcMessage,
  QtlcMemoryPressureParams,
  QtlcPublishDiagnosticsParams,
} from "./protocol";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

export class QtlcServerClient implements vscode.Disposable {
  private process: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private stdoutBuffer = "";
  private readonly pending = new Map<string, PendingRequest>();
  private readonly diagnosticsEmitter =
    new vscode.EventEmitter<QtlcPublishDiagnosticsParams>();
  private readonly traceEmitter = new vscode.EventEmitter<unknown>();
  private readonly memoryPressureEmitter =
    new vscode.EventEmitter<QtlcMemoryPressureParams>();
  private readonly exitEmitter =
    new vscode.EventEmitter<{ code: number | null; signal: string | null }>();
  private disposed = false;

  readonly onDiagnostics = this.diagnosticsEmitter.event;
  readonly onTrace = this.traceEmitter.event;
  readonly onMemoryPressure = this.memoryPressureEmitter.event;
  readonly onExit = this.exitEmitter.event;

  constructor(
    private readonly qtlcPath: string,
    private readonly workspaceRoot: string | undefined,
    private readonly traceProtocol: boolean,
    private readonly output: vscode.OutputChannel,
  ) {}

  start(): void {
    if (this.process) {
      return;
    }
    this.disposed = false;
    this.process = spawn(this.qtlcPath, ["server"], {
      cwd: this.workspaceRoot,
      stdio: "pipe",
    });
    this.output.appendLine(`qtlc server started: ${this.qtlcPath}`);
    this.process.stdout.on("data", (chunk: Buffer) => {
      this.consumeStdout(chunk.toString("utf8"));
    });
    this.process.stderr.on("data", (chunk: Buffer) => {
      this.output.append(chunk.toString("utf8"));
    });
    this.process.on("error", (error) => {
      this.output.appendLine(`qtlc server failed: ${error.message}`);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });
    this.process.on("exit", (code, signal) => {
      this.output.appendLine(
        `qtlc server exited code=${code ?? "null"} signal=${signal ?? "null"}`,
      );
      this.process = undefined;
      if (!this.disposed) {
        this.exitEmitter.fire({ code, signal });
      }
      for (const pending of this.pending.values()) {
        pending.reject(new Error("qtlc server exited"));
      }
      this.pending.clear();
    });
  }

  async initialize(): Promise<unknown> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return this.request("initialize", {
      rootPath: this.workspaceRoot,
      workspaceFolders: folders.map((folder) => ({
        uri: folder.uri.toString(),
        name: folder.name,
      })),
      qtlcTrace: this.traceProtocol,
    });
  }

  notify(method: string, params: unknown): void {
    this.start();
    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      method,
      params,
    };
    this.writeMessage(message);
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.start();
    const id = `qtlc-ext-${this.nextId++}`;
    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        qtlcTrace: this.traceProtocol,
      },
    };
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.writeMessage(message);
    return promise;
  }

  resolveCodeAction(data: unknown): Promise<unknown> {
    return this.request("codeAction/resolve", { data });
  }

  cacheSummary(
    packageRoot: string | undefined,
    packageTarget: string | undefined,
  ): Promise<unknown> {
    return this.request("qtlc/cacheSummary", {
      packageRoot,
      packageTarget,
    });
  }

  clearCache(
    cache: "checked-source" | "code-actions" | "all",
    packageRoot: string | undefined,
    packageTarget: string | undefined,
  ): Promise<unknown> {
    return this.request("qtlc/cacheClear", {
      cache,
      packageRoot,
      packageTarget,
    });
  }

  serverVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.qtlcPath, ["--version"], {
        cwd: this.workspaceRoot,
        stdio: "pipe",
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        reject(error);
      });
      child.on("close", (code) => {
        const text = stdout.trim() || stderr.trim();
        if (code === 0) {
          resolve(text || "qtlc version unavailable");
          return;
        }
        reject(new Error(text || `qtlc --version exited with ${code}`));
      });
    });
  }

  dispose(): void {
    this.disposed = true;
    this.diagnosticsEmitter.dispose();
    this.traceEmitter.dispose();
    this.memoryPressureEmitter.dispose();
    this.exitEmitter.dispose();
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    for (const pending of this.pending.values()) {
      pending.reject(new Error("qtlc server disposed"));
    }
    this.pending.clear();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private writeMessage(message: JsonRpcMessage): void {
    this.output.appendLine(`-> ${message.method ?? `response:${message.id}`}`);
    this.process?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private consumeStdout(text: string): void {
    this.stdoutBuffer += text;
    while (true) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) {
        return;
      }
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line.length === 0) {
        continue;
      }
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch (error) {
      this.output.appendLine(`invalid qtlc server JSON: ${String(error)}`);
      this.output.appendLine(line);
      return;
    }
    if (message.method === "textDocument/publishDiagnostics") {
      this.diagnosticsEmitter.fire(
        message.params as QtlcPublishDiagnosticsParams,
      );
      return;
    }
    if (message.method === "$/qtlc/protocolTrace") {
      this.traceEmitter.fire(message.params);
      return;
    }
    if (message.method === "$/qtlc/memoryPressure") {
      this.output.appendLine(
        `memory-pressure ${JSON.stringify(message.params)}`,
      );
      this.memoryPressureEmitter.fire(
        message.params as QtlcMemoryPressureParams,
      );
      return;
    }
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    this.output.appendLine(`<- ${line}`);
  }
}
