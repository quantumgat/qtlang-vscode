import * as vscode from "vscode";

export class QtlcStatus implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private diagnosticCount = 0;
  private memoryPressureCount = 0;
  private packageRoot: string | undefined;
  private packageTarget = "app";
  private serverState = "starting";

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = "quantumlang.selectPackageRoot";
    this.item.tooltip = "QuantumLang server status and selected package root";
    this.update();
    this.item.show();
  }

  setServerState(state: string): void {
    this.serverState = state;
    this.update();
  }

  setPackageRoot(root: string | undefined): void {
    this.packageRoot = root;
    this.update();
  }

  setPackageTarget(target: string): void {
    this.packageTarget = target;
    this.update();
  }

  setDiagnosticCount(count: number): void {
    this.diagnosticCount = count;
    this.update();
  }

  setMemoryPressureCount(count: number): void {
    this.memoryPressureCount = count;
    this.update();
  }

  dispose(): void {
    this.item.dispose();
  }

  private update(): void {
    const issueText =
      this.diagnosticCount === 0
        ? "0 issues"
        : `${this.diagnosticCount} issue${this.diagnosticCount === 1 ? "" : "s"}`;
    const rootText = this.packageRoot ? shortRoot(this.packageRoot) : "no root";
    this.item.text =
      `QTLC: ${this.serverState} | ${issueText} | ${rootText}:${this.packageTarget}`;
    this.item.tooltip = [
      "QuantumLang server status and selected package root",
      `Root: ${this.packageRoot ?? "none"}`,
      `Target: ${this.packageTarget}`,
      `Diagnostics: ${this.diagnosticCount}`,
      `Memory-pressure notifications: ${this.memoryPressureCount}`,
    ].join("\n");
  }
}

function shortRoot(root: string): string {
  const normalized = root.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.length === 0 ? normalized : parts[parts.length - 1];
}
