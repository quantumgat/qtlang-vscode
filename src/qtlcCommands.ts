import * as vscode from "vscode";

export function workspacePackageRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}

export async function selectPackageRoot(
  currentRoot: string | undefined,
): Promise<string | undefined> {
  const roots = workspacePackageRoots();
  if (roots.length === 0) {
    vscode.window.showWarningMessage("Open a QuantumLang workspace first.");
    return currentRoot;
  }
  if (roots.length === 1) {
    vscode.window.showInformationMessage(`QuantumLang package root: ${roots[0]}`);
    return roots[0];
  }
  const selected = await vscode.window.showQuickPick(
    roots.map((root) => ({
      label: root,
      description: root === currentRoot ? "current" : undefined,
    })),
    {
      title: "Select QuantumLang package root",
      placeHolder: "Choose the package root used by qtlc build/run and qtlc server",
    },
  );
  return selected?.label ?? currentRoot;
}

export function runQtlcBuild(
  qtlcPath: string,
  packageRoot: string | undefined,
): void {
  runQtlcTerminal(qtlcPath, ["build"], packageRoot, "QuantumLang Build");
}

export function runQtlcRun(
  qtlcPath: string,
  packageRoot: string | undefined,
): void {
  runQtlcTerminal(qtlcPath, ["run"], packageRoot, "QuantumLang Run");
}

function runQtlcTerminal(
  qtlcPath: string,
  args: string[],
  packageRoot: string | undefined,
  name: string,
): void {
  if (!packageRoot) {
    vscode.window.showErrorMessage(
      "Select a QuantumLang package root before running qtlc.",
    );
    return;
  }
  const terminal = vscode.window.createTerminal({
    name,
    cwd: packageRoot,
  });
  terminal.show();
  terminal.sendText(commandLine(qtlcPath, args));
}

function commandLine(command: string, args: string[]): string {
  return [quote(command), ...args.map(quote)].join(" ");
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, "\\\"")}"`;
}
