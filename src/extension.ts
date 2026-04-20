import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { QtlcServerClient } from "./qtlcServerClient";
import {
  runQtlcBuild,
  runQtlcRun,
  selectPackageRoot,
  workspacePackageRoots,
} from "./qtlcCommands";
import {
  documentSelector,
  QtlcMemoryPressureParams,
  QtlcPublishDiagnosticsParams,
  textDocumentIdentifier,
  textDocumentPositionParams,
  vscodeRange,
} from "./protocol";
import { QtlcStatus } from "./status";

let client: QtlcServerClient | undefined;
let diagnostics: vscode.DiagnosticCollection | undefined;
let status: QtlcStatus | undefined;
let selectedPackageRoot: string | undefined;
let qtlcPathSetting = "qtlc";
let activeQtlcPath = "qtlc";
let traceProtocolSetting = false;
let packageTargetSetting = "app";
let serverRestartTimer: ReturnType<typeof setTimeout> | undefined;
let serverRestartAttempts = 0;
const packageRootStateKey = "quantumlang.selectedPackageRoot";
const diagnosticCounts = new Map<string, number>();
const documentProtocolVersions = new Map<string, number>();
const recentMemoryPressure: QtlcMemoryPressureParams[] = [];
const maxRecentMemoryPressure = 8;

type RenamePreviewRefreshRequest = {
  document: vscode.TextDocument;
  position: vscode.Position;
  newName: string;
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("QuantumLang");
  diagnostics = vscode.languages.createDiagnosticCollection("quantumlang");
  status = new QtlcStatus();
  context.subscriptions.push(output, diagnostics, status);

  const config = vscode.workspace.getConfiguration("quantumlang");
  selectedPackageRoot =
    context.workspaceState.get<string>(packageRootStateKey) ??
    workspacePackageRoots()[0];
  qtlcPathSetting = config.get<string>("qtlcPath", "qtlc");
  activeQtlcPath = resolveQtlcPath(qtlcPathSetting, selectedPackageRoot);
  traceProtocolSetting = config.get<boolean>("traceProtocol", false);
  packageTargetSetting = config.get<string>("packageTarget", "app");
  status.setPackageTarget(packageTargetSetting);
  await startClient(context, output, activeQtlcPath, traceProtocolSetting);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration("quantumlang.qtlcPath") &&
          !event.affectsConfiguration("quantumlang.traceProtocol") &&
          !event.affectsConfiguration("quantumlang.packageTarget")) {
        return;
      }
      const updated = vscode.workspace.getConfiguration("quantumlang");
      qtlcPathSetting = updated.get<string>("qtlcPath", "qtlc");
      traceProtocolSetting = updated.get<boolean>("traceProtocol", false);
      packageTargetSetting = updated.get<string>("packageTarget", "app");
      status?.setPackageTarget(packageTargetSetting);
      activeQtlcPath = resolveQtlcPath(qtlcPathSetting, selectedPackageRoot);
      if (!event.affectsConfiguration("quantumlang.qtlcPath") &&
          !event.affectsConfiguration("quantumlang.traceProtocol")) {
        return;
      }
      status?.setServerState("reconfiguring");
      await startClient(context, output, activeQtlcPath, traceProtocolSetting);
    }),
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "quantumlang") {
        sendDidOpen(document);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "quantumlang") {
        sendDidChange(event.document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.languageId === "quantumlang") {
        sendDidClose(document);
        diagnostics?.delete(document.uri);
        diagnosticCounts.delete(document.uri.toString());
        updateDiagnosticStatus();
      }
    }),
    vscode.commands.registerCommand("quantumlang.selectPackageRoot", async () => {
      selectedPackageRoot = await selectPackageRoot(selectedPackageRoot);
      await context.workspaceState.update(
        packageRootStateKey,
        selectedPackageRoot,
      );
      activeQtlcPath = resolveQtlcPath(qtlcPathSetting, selectedPackageRoot);
      status?.setPackageRoot(selectedPackageRoot);
      await startClient(context, output, activeQtlcPath, traceProtocolSetting);
    }),
    vscode.commands.registerCommand("quantumlang.build", () => {
      runQtlcBuild(activeQtlcPath, selectedPackageRoot);
    }),
    vscode.commands.registerCommand("quantumlang.run", () => {
      runQtlcRun(activeQtlcPath, selectedPackageRoot);
    }),
    vscode.commands.registerCommand("quantumlang.showServerOutput", () => {
      output.show(true);
    }),
    vscode.commands.registerCommand("quantumlang.preflight", async () => {
      await runPreflight(output);
    }),
    vscode.commands.registerCommand("quantumlang.restartServer", async () => {
      await restartServerManually(context, output);
    }),
    vscode.commands.registerCommand("quantumlang.cacheDashboard", async () => {
      await showCacheDashboard(context, output);
    }),
    vscode.commands.registerCommand("quantumlang.cacheSummary", async () => {
      const response = await client?.cacheSummary(
        selectedPackageRoot,
        packageTargetSetting,
      );
      output.appendLine(cacheSummaryText(response));
      output.show(true);
      vscode.window.showInformationMessage("QuantumLang cache summary written to the output channel.");
    }),
    vscode.commands.registerCommand("quantumlang.clearCurrentPackageCache", async () => {
      const response = await client?.clearCache(
        "all",
        selectedPackageRoot,
        packageTargetSetting,
      );
      output.appendLine(cacheSummaryText(response));
      output.show(true);
      vscode.window.showInformationMessage("QuantumLang current package cache cleared.");
    }),
    vscode.commands.registerCommand("quantumlang.clearCodeActionCache", async () => {
      const response = await client?.clearCache(
        "code-actions",
        selectedPackageRoot,
        packageTargetSetting,
      );
      output.appendLine(cacheSummaryText(response));
      output.show(true);
      vscode.window.showInformationMessage("QuantumLang code-action cache cleared.");
    }),
    vscode.commands.registerCommand("quantumlang.formatDocument", async () => {
      await vscode.commands.executeCommand("editor.action.formatDocument");
    }),
    vscode.commands.registerCommand("quantumlang.renameSymbol", async () => {
      await vscode.commands.executeCommand("editor.action.rename");
    }),
    vscode.commands.registerCommand(
      "quantumlang.internal.resolveCodeAction",
      async (data: unknown) => {
        try {
          const resolved = await client?.resolveCodeAction(data);
          const staleMessage = staleCodeActionMessage(resolved);
          if (staleMessage) {
            vscode.window.showWarningMessage(staleMessage);
            return;
          }
          const action = codeActionFromAny(resolved, true);
          if (!action?.edit || action.edit.entries().length === 0) {
            vscode.window.showWarningMessage(
              "QuantumLang code action did not return an applyable edit.",
            );
            return;
          }
          const applied = await vscode.workspace.applyEdit(action.edit);
          if (!applied) {
            vscode.window.showErrorMessage(
              "QuantumLang code action edit could not be applied.",
            );
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `QuantumLang code-action apply failed: ${errorMessage(error)}`,
          );
        }
      },
    ),
    vscode.languages.registerHoverProvider(documentSelector(), {
      provideHover: async (document, position) => {
        const params = withPackageRoute(
          textDocumentPositionParams(document, position) as Record<string, unknown>,
          document,
        );
        const response = await requestServer("textDocument/hover", params);
        return hoverFromResponse(response);
      },
    }),
    vscode.languages.registerDefinitionProvider(documentSelector(), {
      provideDefinition: async (document, position) => {
        const params = withPackageRoute(
          textDocumentPositionParams(document, position) as Record<string, unknown>,
          document,
        );
        const response = await requestServer("textDocument/definition", params);
        return definitionFromResponse(response);
      },
    }),
    vscode.languages.registerCompletionItemProvider(documentSelector(), {
      provideCompletionItems: async (document, position, token, context) => {
        void token;
        const params = withPackageRoute({
          ...(textDocumentPositionParams(document, position) as Record<string, unknown>),
          prefix: completionPrefix(document, position),
          triggerKind: context.triggerKind,
          triggerCharacter: context.triggerCharacter,
        }, document);
        const response = await requestServer("textDocument/completion", params);
        return completionsFromResponse(response);
      },
    }, ".", ":", "_"),
    vscode.languages.registerDocumentFormattingEditProvider(documentSelector(), {
      provideDocumentFormattingEdits: async (document, options) => {
        const response = await requestFutureServerMethod("textDocument/formatting", {
          textDocument: textDocumentIdentifier(document),
          options: formatRequestOptions(options),
        }, document);
        return textEditsFromResponse(response);
      },
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider(documentSelector(), {
      provideDocumentRangeFormattingEdits: async (document, range, options) => {
        const response = await requestFutureServerMethod(
          "textDocument/rangeFormatting",
          {
            textDocument: textDocumentIdentifier(document),
            range: lspRange(range),
            options: formatRequestOptions(options),
          },
          document,
        );
        return textEditsFromResponse(response);
      },
    }),
    vscode.languages.registerRenameProvider(documentSelector(), {
      prepareRename: async (document, position) => {
        const response = await requestServer(
          "textDocument/prepareRename",
          withPackageRoute(
            textDocumentPositionParams(document, position) as Record<string, unknown>,
            document,
          ),
        );
        const prepared = prepareRenameFromResponse(response);
        if (!prepared) {
          vscode.window.showWarningMessage(
            "QuantumLang could not prepare rename at this position.",
          );
        }
        return prepared;
      },
      provideRenameEdits: async (document, position, newName) => {
        const response = await requestFutureServerMethod("textDocument/rename", {
          ...(textDocumentPositionParams(document, position) as Record<string, unknown>),
          newName,
        }, document);
        const edit = workspaceEditFromResponse(response);
        if (edit) {
          return edit;
        }
        const previewResponse = await requestFutureServerMethod("qtlc/renamePreview", {
          ...(textDocumentPositionParams(document, position) as Record<string, unknown>),
          newName,
        }, document);
        await maybeApplyRenamePreview(previewResponse ?? response, {
          document,
          position,
          newName,
        });
        return undefined;
      },
    }),
    vscode.languages.registerCodeActionsProvider(documentSelector(), {
      provideCodeActions: async (document, range, context) => {
        const response = await requestServer("textDocument/codeAction", withPackageRoute({
          textDocument: textDocumentIdentifier(document),
          range: lspRange(range),
          context: {
            diagnostics: context.diagnostics.map((diagnostic) => ({
              code: diagnostic.code,
              message: diagnostic.message,
            })),
          },
        }, document));
        return codeActionsFromResponse(response);
      },
      resolveCodeAction: async (action) => {
        try {
          const data = (action as vscode.CodeAction & { data?: unknown }).data ??
            action.command?.arguments?.[0] ??
            action;
          const resolved = await client?.resolveCodeAction(data);
          return codeActionFromAny(resolved, true) ?? action;
        } catch (error) {
          vscode.window.showErrorMessage(
            `QuantumLang code-action resolve failed: ${errorMessage(error)}`,
          );
          return action;
        }
      },
    }, {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.RefactorRewrite,
        vscode.CodeActionKind.SourceOrganizeImports,
      ],
    }),
  );
}

export function deactivate(): void {
  clearServerRestart();
  client?.dispose();
  client = undefined;
}

async function startClient(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  qtlcPath: string,
  traceProtocol: boolean,
): Promise<void> {
  clearServerRestart();
  client?.dispose();
  status?.setServerState("starting");
  status?.setPackageRoot(selectedPackageRoot);
  status?.setPackageTarget(packageTargetSetting);
  client = new QtlcServerClient(
    qtlcPath,
    selectedPackageRoot,
    traceProtocol,
    output,
  );
  context.subscriptions.push(client);
  client.onDiagnostics((params) => applyDiagnostics(params));
  client.onTrace((trace) => output.appendLine(`trace ${JSON.stringify(trace)}`));
  client.onMemoryPressure((pressure) => rememberMemoryPressure(pressure, output));
  client.onExit(({ code, signal }) => {
    status?.setServerState("crashed");
    scheduleServerRestart(context, output, code, signal);
  });
  try {
    await client.initialize();
    serverRestartAttempts = 0;
    status?.setServerState("ready");
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === "quantumlang") {
        sendDidOpen(document);
      }
    }
  } catch (error) {
    status?.setServerState("error");
    const message = qtlcServerStartMessage(error, qtlcPath);
    output.appendLine(`qtlc server initialize error: ${message}`);
    const choice = await vscode.window.showErrorMessage(
      `QuantumLang server failed to initialize: ${message}`,
      "Open Settings",
      "Show Output",
    );
    if (choice === "Open Settings") {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "quantumlang.qtlcPath",
      );
    } else if (choice === "Show Output") {
      output.show(true);
    }
  }
}

function rememberMemoryPressure(
  pressure: QtlcMemoryPressureParams,
  output: vscode.OutputChannel,
): void {
  recentMemoryPressure.push(pressure);
  while (recentMemoryPressure.length > maxRecentMemoryPressure) {
    recentMemoryPressure.shift();
  }
  status?.setMemoryPressureCount(recentMemoryPressure.length);
  output.appendLine(`recent-memory-pressure ${memoryPressureText(pressure)}`);
}

async function showCacheDashboard(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): Promise<void> {
  const response = await client?.cacheSummary(
    selectedPackageRoot,
    packageTargetSetting,
  );
  const payload = firstResponse(response);
  const root = cachePackageRoot(payload);
  const checkedSize = numberField(payload, "compiler_server_cache_size") ?? 0;
  const checkedMax = numberField(payload, "checked_source_cache_max_size") ?? 0;
  const codeActionSize = numberField(payload, "code_action_cache_size") ?? 0;
  const codeActionMax = numberField(payload, "code_action_cache_max_size") ?? 0;
  const snapshots = numberField(payload, "source_snapshot_count") ?? 0;
  const snapshotBytes =
    numberField(payload, "total_source_snapshot_byte_size") ?? 0;
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: "Show Cache Summary",
        description: `${checkedSize}/${checkedMax} checked-source, ${codeActionSize}/${codeActionMax} actions`,
        detail:
          `${root} target=${packageTargetSetting}; ${snapshots} snapshot(s), ${snapshotBytes} byte(s)`,
      },
      {
        label: "Clear Current Package Cache",
        description: "Clear checked-source and code-action caches",
        detail: `${root} target=${packageTargetSetting}`,
      },
      {
        label: "Clear Code-Action Cache",
        description: "Clear cached actions and rename previews",
        detail: `${root} target=${packageTargetSetting}`,
      },
      {
        label: "Restart Language Server",
        description: "Restart without changing settings",
        detail: `${activeQtlcPath} from ${root}`,
      },
      {
        label: "Show Server Output",
        description:
          `${recentMemoryPressure.length} recent memory-pressure notification(s)`,
        detail: "Open the QuantumLang output channel.",
      },
    ],
    {
      title: "QuantumLang Cache Dashboard",
      placeHolder:
        "Inspect cache state, clear server caches, or restart qtlc server",
    },
  );
  if (!selected) {
    return;
  }
  if (selected.label === "Show Cache Summary") {
    output.appendLine(cacheSummaryText(response));
    output.show(true);
    return;
  }
  if (selected.label === "Clear Current Package Cache") {
    await vscode.commands.executeCommand("quantumlang.clearCurrentPackageCache");
    return;
  }
  if (selected.label === "Clear Code-Action Cache") {
    await vscode.commands.executeCommand("quantumlang.clearCodeActionCache");
    return;
  }
  if (selected.label === "Restart Language Server") {
    await restartServerManually(context, output);
    return;
  }
  if (selected.label === "Show Server Output") {
    output.show(true);
  }
}

async function runPreflight(output: vscode.OutputChannel): Promise<void> {
  output.appendLine("QuantumLang preflight started");
  let version = "unavailable";
  try {
    version = await client?.serverVersion() ?? "unavailable";
  } catch (error) {
    version = `error: ${errorMessage(error)}`;
  }
  const cacheResponse = await client?.cacheSummary(
    selectedPackageRoot,
    packageTargetSetting,
  );
  const payload = firstResponse(cacheResponse);
  const root = cachePackageRoot(payload);
  const checkedSize = numberField(payload, "compiler_server_cache_size") ?? 0;
  const checkedMax = numberField(payload, "checked_source_cache_max_size") ?? 0;
  const codeActionSize = numberField(payload, "code_action_cache_size") ?? 0;
  const codeActionMax = numberField(payload, "code_action_cache_max_size") ?? 0;
  const snapshots = numberField(payload, "source_snapshot_count") ?? 0;
  const snapshotBytes =
    numberField(payload, "total_source_snapshot_byte_size") ?? 0;
  const checkedEvictions =
    numberField(payload, "total_checked_source_evictions") ?? 0;
  const actionEvictions =
    numberField(payload, "code_action_cache_total_evictions") ?? 0;
  const lines = [
    "QuantumLang IDE Preflight",
    `  qtlcPath setting: ${qtlcPathSetting}`,
    `  qtlcPath active: ${activeQtlcPath}`,
    `  qtlc version: ${version}`,
    `  package root: ${root}`,
    `  package target: ${packageTargetSetting}`,
    `  cache checked-source: ${checkedSize}/${checkedMax} entries, ${checkedEvictions} eviction(s)`,
    `  cache code-actions: ${codeActionSize}/${codeActionMax} entries, ${actionEvictions} eviction(s)`,
    `  source snapshots: ${snapshots} snapshot(s), ${snapshotBytes} byte(s)`,
    `  recent memory-pressure notifications: ${recentMemoryPressure.length}`,
  ];
  output.appendLine(lines.join("\n"));
  output.show(true);
  vscode.window.showInformationMessage(
    "QuantumLang preflight written to the output channel.",
  );
}

async function restartServerManually(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): Promise<void> {
  clearServerRestart();
  serverRestartAttempts = 0;
  output.appendLine("manual qtlc server restart requested");
  status?.setServerState("restarting");
  await startClient(context, output, activeQtlcPath, traceProtocolSetting);
}

function scheduleServerRestart(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  code: number | null,
  signal: string | null,
): void {
  if (serverRestartTimer) {
    return;
  }
  serverRestartAttempts += 1;
  if (serverRestartAttempts > 5) {
    status?.setServerState("stopped");
    vscode.window.showErrorMessage(
      "QuantumLang server stopped after repeated crashes. Check the QuantumLang output channel.",
    );
    return;
  }
  const delayMs = Math.min(30000, 500 * 2 ** (serverRestartAttempts - 1));
  output.appendLine(
    `qtlc server crashed code=${code ?? "null"} signal=${signal ?? "null"}; restarting in ${delayMs}ms`,
  );
  status?.setServerState(`restart ${serverRestartAttempts}`);
  serverRestartTimer = setTimeout(() => {
    serverRestartTimer = undefined;
    void startClient(context, output, activeQtlcPath, traceProtocolSetting);
  }, delayMs);
}

function clearServerRestart(): void {
  if (serverRestartTimer) {
    clearTimeout(serverRestartTimer);
    serverRestartTimer = undefined;
  }
}

function sendDidOpen(document: vscode.TextDocument): void {
  const version = openDocumentProtocolVersion(document);
  client?.notify("textDocument/didOpen", withPackageRoute({
    textDocument: {
      ...textDocumentIdentifierWithVersion(document, version),
      languageId: "quantumlang",
      text: document.getText(),
    },
  }, document));
}

function sendDidChange(document: vscode.TextDocument): void {
  const version = nextDocumentProtocolVersion(document);
  client?.notify("textDocument/didChange", withPackageRoute({
    textDocument: textDocumentIdentifierWithVersion(document, version),
    contentChanges: [
      {
        text: document.getText(),
      },
    ],
  }, document));
}

function sendDidClose(document: vscode.TextDocument): void {
  const version = currentDocumentProtocolVersion(document);
  client?.notify("textDocument/didClose", withPackageRoute({
    textDocument: textDocumentIdentifierWithVersion(document, version),
  }, document));
  documentProtocolVersions.delete(document.uri.toString());
}

function textDocumentIdentifierWithVersion(
  document: vscode.TextDocument,
  version: number,
): { uri: string; version?: number } {
  return {
    ...textDocumentIdentifier(document),
    version,
  };
}

function openDocumentProtocolVersion(document: vscode.TextDocument): number {
  const key = document.uri.toString();
  const version = documentProtocolVersions.get(key) ?? 1;
  documentProtocolVersions.set(key, version);
  return version;
}

function nextDocumentProtocolVersion(document: vscode.TextDocument): number {
  const key = document.uri.toString();
  const version = (documentProtocolVersions.get(key) ?? 0) + 1;
  documentProtocolVersions.set(key, version);
  return version;
}

function currentDocumentProtocolVersion(document: vscode.TextDocument): number {
  return documentProtocolVersions.get(document.uri.toString()) ?? 1;
}

async function requestServer(
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (!client) {
    return undefined;
  }
  try {
    return await client.request(method, params);
  } catch (error) {
    status?.setServerState("error");
    vscode.window.showErrorMessage(
      `QuantumLang request ${method} failed: ${errorMessage(error)}`,
    );
    return undefined;
  }
}

async function requestFutureServerMethod(
  method: string,
  params: Record<string, unknown>,
  document?: vscode.TextDocument,
): Promise<unknown> {
  if (!client) {
    return undefined;
  }
  try {
    return await client.request(method, withPackageRoute(params, document));
  } catch (error) {
    status?.setServerState("ready");
    return undefined;
  }
}

function applyDiagnostics(params: QtlcPublishDiagnosticsParams): void {
  if (!diagnostics) {
    return;
  }
  const uri = vscode.Uri.parse(params.uri);
  const mapped = (params.diagnostics ?? []).map((diagnostic) => {
    const item = new vscode.Diagnostic(
      vscodeRange(diagnostic.range),
      diagnostic.message ?? "QuantumLang diagnostic",
      diagnostic.severity ?? vscode.DiagnosticSeverity.Error,
    );
    item.source = diagnostic.source ?? "qtlc";
    item.code = diagnostic.code;
    return item;
  });
  diagnostics.set(uri, mapped);
  diagnosticCounts.set(uri.toString(), mapped.length);
  updateDiagnosticStatus();
}

function hoverFromResponse(response: unknown): vscode.Hover | undefined {
  const payload = firstResponse(response);
  const text =
    stringField(payload, "contents") ??
    stringField(payload, "message") ??
    stringField(payload, "signature");
  if (!text) {
    return undefined;
  }
  const markdown = new vscode.MarkdownString(text);
  markdown.appendMarkdown(`\n\n---\n${packageFactsMarkdown()}`);
  return new vscode.Hover(markdown);
}

function definitionFromResponse(response: unknown): vscode.Location | undefined {
  const payload = firstResponse(response);
  const location = objectField(payload, "location") ?? objectField(payload, "lsp_location");
  const uri = stringField(location, "uri");
  const range = objectField(location, "range");
  if (!uri || !range) {
    return undefined;
  }
  return new vscode.Location(vscode.Uri.parse(uri), vscodeRange(range as never));
}

function completionsFromResponse(response: unknown): vscode.CompletionItem[] {
  const payload = firstResponse(response);
  const lspItems = arrayField(payload, "lsp_completion_items");
  const items = lspItems.length > 0 ? lspItems : arrayField(payload, "items");
  return items.map((item) => {
    const label = stringField(item, "label") ?? stringField(item, "name") ?? "";
    const completion = new vscode.CompletionItem(label);
    completion.detail = stringField(item, "detail") ?? undefined;
    completion.documentation = stringField(item, "documentation") ?? undefined;
    return completion;
  });
}

function cacheSummaryText(response: unknown): string {
  const payload = firstResponse(response);
  const query = stringField(payload, "query") ?? "cache";
  const message = stringField(payload, "message") ?? "QuantumLang cache response";
  const root = cachePackageRoot(payload);
  const target = stringField(payload, "cache_control_package_target") ??
    stringField(payload, "package_target") ??
    packageTargetSetting;
  const kind = stringField(payload, "cache_control_kind") ?? "summary";
  const checkedSize = numberField(payload, "compiler_server_cache_size") ?? 0;
  const checkedMax = numberField(payload, "checked_source_cache_max_size") ?? 0;
  const codeActionSize = numberField(payload, "code_action_cache_size") ?? 0;
  const codeActionMax = numberField(payload, "code_action_cache_max_size") ?? 0;
  const snapshots = numberField(payload, "source_snapshot_count") ?? 0;
  const snapshotBytes =
    numberField(payload, "total_source_snapshot_byte_size") ?? 0;
  const clearedChecked =
    numberField(payload, "cleared_checked_source_count") ?? 0;
  const clearedActions = numberField(payload, "cleared_code_action_count") ?? 0;
  const checkedEvictions =
    numberField(payload, "total_checked_source_evictions") ?? 0;
  const actionEvictions =
    numberField(payload, "code_action_cache_total_evictions") ?? 0;
  const recentPressure = recentMemoryPressure.length === 0
    ? "none"
    : memoryPressureText(recentMemoryPressure[recentMemoryPressure.length - 1]);
  return [
    `QuantumLang cache ${query} (${kind})`,
    `  root: ${root}`,
    `  target: ${target}`,
    `  message: ${message}`,
    `  checked-source: ${checkedSize}/${checkedMax} entries, ${checkedEvictions} eviction(s)`,
    `  code-actions: ${codeActionSize}/${codeActionMax} entries, ${actionEvictions} eviction(s)`,
    `  source snapshots: ${snapshots} snapshot(s), ${snapshotBytes} byte(s)`,
    `  cleared: ${clearedChecked} checked-source, ${clearedActions} code-action`,
    `  recent memory pressure: ${recentPressure}`,
  ].join("\n");
}

function cachePackageRoot(payload: unknown): string {
  return stringField(payload, "cache_control_package_root") ??
    stringField(payload, "package_root") ??
    selectedPackageRoot ??
    "no package root";
}

function memoryPressureText(pressure: QtlcMemoryPressureParams): string {
  const checkedEvicted = pressure.evicted_checked_source_count ?? 0;
  const actionEvicted = pressure.code_action_cache_evicted_count ?? 0;
  const checkedSize = pressure.checked_source_cache_size ?? 0;
  const checkedMax = pressure.checked_source_cache_max_size ?? 0;
  const actionSize = pressure.code_action_cache_size ?? 0;
  const actionMax = pressure.code_action_cache_max_size ?? 0;
  const bytes = pressure.total_source_snapshot_byte_size ?? 0;
  const method = pressure.method ?? "editor operation";
  return `${method}: evicted checked=${checkedEvicted}, actions=${actionEvicted}; checked=${checkedSize}/${checkedMax}; actions=${actionSize}/${actionMax}; snapshots=${bytes} bytes`;
}

function codeActionsFromResponse(response: unknown): vscode.CodeAction[] {
  const payload = firstResponse(response);
  const lspActions = arrayField(payload, "lsp_code_actions");
  const actions = lspActions.length > 0 ? lspActions : arrayField(payload, "actions");
  return actions.map((action) => codeActionFromAny(action, false)).filter(isDefined);
}

function codeActionFromAny(
  value: unknown,
  resolved: boolean,
): vscode.CodeAction | undefined {
  const title = stringField(value, "title");
  if (!title) {
    return undefined;
  }
  const action = new vscode.CodeAction(title, codeActionKind(stringField(value, "kind")));
  const edit = objectField(value, "edit") ?? objectField(value, "workspace_edit");
  const mappedEdit = workspaceEditFromAny(edit);
  action.edit = mappedEdit.edit;
  if (mappedEdit.errors.length > 0) {
    action.disabled = {
      reason: mappedEdit.errors.join("; "),
    };
    if (resolved) {
      vscode.window.showErrorMessage(
        `QuantumLang could not map code-action edits: ${mappedEdit.errors.join("; ")}`,
      );
    }
  }
  const data = objectField(value, "data") ?? value;
  (action as vscode.CodeAction & { data?: unknown }).data = data;
  action.command = {
    title: "Resolve QuantumLang code action",
    command: "quantumlang.internal.resolveCodeAction",
    arguments: [data],
  };
  return action;
}

function workspaceEditFromAny(value: unknown): {
  edit: vscode.WorkspaceEdit | undefined;
  errors: string[];
} {
  const changes = objectField(value, "changes");
  if (!changes) {
    return {
      edit: undefined,
      errors: [],
    };
  }
  const edit = new vscode.WorkspaceEdit();
  const errors: string[] = [];
  for (const [uriText, edits] of Object.entries(changes)) {
    if (!Array.isArray(edits)) {
      errors.push(`edits for ${uriText} are not an array`);
      continue;
    }
    for (const item of edits) {
      const range = objectField(item, "lsp_range") ?? objectField(item, "range");
      const newText = stringField(item, "newText") ?? stringField(item, "new_text");
      if (!range) {
        errors.push(`edit for ${uriText} is missing a range`);
        continue;
      }
      if (newText === undefined) {
        errors.push(`edit for ${uriText} is missing newText`);
        continue;
      }
      try {
        edit.replace(vscode.Uri.parse(uriText), vscodeRange(range as never), newText);
      } catch (error) {
        errors.push(`edit for ${uriText} failed: ${errorMessage(error)}`);
      }
    }
  }
  return {
    edit,
    errors,
  };
}

function workspaceEditFromResponse(response: unknown): vscode.WorkspaceEdit | undefined {
  const payload = firstResponse(response);
  const edit = objectField(payload, "edit") ?? objectField(payload, "workspace_edit") ??
    objectField(payload, "result") ??
    (objectField(payload, "changes") ? payload as Record<string, unknown> : undefined);
  return workspaceEditFromAny(edit).edit;
}

function textEditsFromResponse(response: unknown): vscode.TextEdit[] {
  const payload = firstResponse(response);
  const edits = Array.isArray(payload)
    ? payload
    : arrayField(payload, "lsp_text_edits").length > 0
      ? arrayField(payload, "lsp_text_edits")
      : arrayField(payload, "edits").length > 0
        ? arrayField(payload, "edits")
        : arrayField(payload, "text_edits");
  return edits.map((edit) => {
    const range = objectField(edit, "lsp_range") ?? objectField(edit, "range");
    const newText = stringField(edit, "newText") ?? stringField(edit, "new_text");
    if (!range || newText === undefined) {
      return undefined;
    }
    return vscode.TextEdit.replace(vscodeRange(range as never), newText);
  }).filter(isDefined);
}

function prepareRenameFromResponse(
  response: unknown,
): vscode.Range | { range: vscode.Range; placeholder: string } | undefined {
  const payload = firstResponse(response);
  const range = objectField(payload, "range") ?? objectField(payload, "lsp_range");
  if (!range) {
    const message = stringField(payload, "message");
    const code = stringField(payload, "diagnostic_code");
    if (message) {
      vscode.window.showWarningMessage(
        `QuantumLang prepare rename failed${code ? ` (${code})` : ""}: ${message}`,
      );
    }
    return undefined;
  }
  const placeholder = stringField(payload, "placeholder") ??
    stringField(payload, "new_name") ??
    stringField(payload, "target") ??
    "symbol";
  return {
    range: vscodeRange(range as never),
    placeholder,
  };
}

async function maybeApplyRenamePreview(
  response: unknown,
  refresh?: RenamePreviewRefreshRequest,
): Promise<void> {
  const payload = firstResponse(response);
  const previewActions = arrayField(payload, "preview_code_actions");
  const lspActions = arrayField(payload, "lsp_code_actions");
  const actions = previewActions.length > 0
    ? previewActions
    : lspActions.length > 0
      ? lspActions
      : arrayField(payload, "actions");
  if (actions.length === 0) {
    return;
  }
  const firstAction = actions[0];
  const firstActionData = objectField(firstAction, "data") ?? firstAction;
  const affectedFiles = numberField(firstAction, "affected_file_count") ??
    numberField(firstActionData, "affectedFileCount");
  const references = numberField(firstAction, "reference_count") ??
    numberField(firstActionData, "referenceCount");
  const countText = affectedFiles !== undefined && references !== undefined
    ? ` This affects ${references} reference(s) in ${affectedFiles} file(s).`
    : "";
  const groupText = referenceGroupSummary(firstAction, firstActionData);
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: "Apply Preview",
        description: countText.trim(),
        detail: previewDetail(groupText),
      },
      {
        label: "Cancel Preview",
        detail: "Keep the current source unchanged.",
      },
      {
        label: "Show Server Output",
        detail: "Open the QuantumLang server log for protocol diagnostics.",
      },
    ],
    {
      title: "QuantumLang Rename Preview",
      placeHolder:
        "Review grouped rename references before resolving and applying edits",
    },
  );
  if (selected?.label === "Show Server Output") {
    await vscode.commands.executeCommand("quantumlang.showServerOutput");
    return;
  }
  if (selected?.label === "Cancel Preview") {
    vscode.window.showInformationMessage("QuantumLang rename preview cancelled.");
    return;
  }
  if (selected?.label !== "Apply Preview") {
    return;
  }
  const action = codeActionFromAny(firstAction, false);
  const actionData = action
    ? (action as vscode.CodeAction & { data?: unknown }).data
    : undefined;
  const data = actionData ??
    objectField(firstAction, "data") ??
    stringField(firstAction, "data_id") ??
    firstAction;
  const resolved = await client?.resolveCodeAction(data);
  const staleMessage = staleCodeActionMessage(resolved);
  if (staleMessage) {
    await maybeRefreshStaleRenamePreview(staleMessage, refresh);
    return;
  }
  const resolvedAction = codeActionFromAny(resolved, true);
  if (!resolvedAction?.edit || resolvedAction.edit.entries().length === 0) {
    vscode.window.showWarningMessage(
      "QuantumLang rename preview did not return an applyable edit.",
    );
    return;
  }
  const applied = await vscode.workspace.applyEdit(resolvedAction.edit);
  if (!applied) {
    vscode.window.showErrorMessage(
      "QuantumLang rename preview edit could not be applied.",
    );
  }
}

async function maybeRefreshStaleRenamePreview(
  message: string,
  refresh: RenamePreviewRefreshRequest | undefined,
): Promise<void> {
  if (!refresh) {
    vscode.window.showWarningMessage(message);
    return;
  }
  const selected = await vscode.window.showWarningMessage(
    message,
    "Refresh Preview",
    "Show Server Output",
  );
  if (selected === "Show Server Output") {
    await vscode.commands.executeCommand("quantumlang.showServerOutput");
    return;
  }
  if (selected !== "Refresh Preview") {
    return;
  }
  const refreshed = await requestFutureServerMethod("qtlc/renamePreview", {
    ...(textDocumentPositionParams(
      refresh.document,
      refresh.position,
    ) as Record<string, unknown>),
    newName: refresh.newName,
  }, refresh.document);
  if (refreshed) {
    await maybeApplyRenamePreview(refreshed, refresh);
  }
}

function previewDetail(groupText: string): string {
  if (!groupText) {
    return "No grouped references were reported by the server.";
  }
  return groupText.replace(/^ Groups: /, "Reference groups: ");
}

function staleCodeActionMessage(response: unknown): string | undefined {
  const payload = firstResponse(response);
  const data = objectField(payload, "data") ?? payload;
  const strategy = stringField(data, "resolveStrategy") ??
    stringField(data, "resolve_strategy");
  if (strategy !== "rename-preview-stale") {
    return undefined;
  }
  return stringField(payload, "title") ??
    "QuantumLang rename preview is stale; request a new preview before applying edits.";
}

function referenceGroupSummary(action: unknown, actionData: unknown): string {
  const groups = arrayField(action, "reference_groups").length > 0
    ? arrayField(action, "reference_groups")
    : arrayField(actionData, "referenceGroups");
  if (groups.length === 0) {
    return "";
  }
  const summary = groups.slice(0, 3).map((group) => {
    const modulePath = stringField(group, "module_path") ??
      stringField(group, "modulePath") ??
      stringField(group, "module_identity") ??
      stringField(group, "moduleIdentity") ??
      "module";
    const packageName = stringField(group, "package_name") ??
      stringField(group, "packageName");
    const count = numberField(group, "reference_count") ??
      numberField(group, "referenceCount") ??
      0;
    return `${packageName ? `${packageName}/` : ""}${modulePath}: ${count}`;
  }).join(", ");
  const suffix = groups.length > 3 ? ", ..." : "";
  return ` Groups: ${summary}${suffix}.`;
}

function formatRequestOptions(
  options: vscode.FormattingOptions,
): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration("quantumlang");
  return {
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces,
    qtlcTrimTrailingWhitespace:
      config.get<boolean>("format.trimTrailingWhitespace", true),
    qtlcEnsureFinalNewline:
      config.get<boolean>("format.ensureFinalNewline", true),
  };
}

function firstResponse(value: unknown): unknown {
  const result = objectField(value, "result") ?? value;
  const responses = arrayField(result, "responses");
  return responses[0] ?? result;
}

function completionPrefix(
  document: vscode.TextDocument,
  position: vscode.Position,
): string {
  const line = document.lineAt(position.line).text.slice(0, position.character);
  return line.match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? "";
}

function withPackageRoute(
  params: Record<string, unknown>,
  document?: vscode.TextDocument,
): Record<string, unknown> {
  const packageRoot = documentPackageRoot(document) ?? selectedPackageRoot;
  return {
    ...params,
    packageRoot,
    packageTarget: packageTargetSetting,
  };
}

function documentPackageRoot(document: vscode.TextDocument | undefined): string | undefined {
  if (!document || document.uri.scheme !== "file") {
    return undefined;
  }
  return nearestQuantumManifestRoot(path.dirname(document.uri.fsPath));
}

function nearestQuantumManifestRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, "quantum.toml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function packageFactsMarkdown(): string {
  const root = selectedPackageRoot ? shortRoot(selectedPackageRoot) : "no root";
  return `QTLC package: \`${root}\` target: \`${packageTargetSetting}\``;
}

function lspRange(range: vscode.Range): unknown {
  return {
    start: {
      line: range.start.line,
      character: range.start.character,
    },
    end: {
      line: range.end.line,
      character: range.end.character,
    },
  };
}

function codeActionKind(kind: string | undefined): vscode.CodeActionKind {
  if (kind === "refactor.rewrite") {
    return vscode.CodeActionKind.RefactorRewrite;
  }
  if (kind === "source.organizeImports") {
    return vscode.CodeActionKind.SourceOrganizeImports;
  }
  return vscode.CodeActionKind.QuickFix;
}

function stringField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const item = value[field];
  return typeof item === "string" ? item : undefined;
}

function objectField(value: unknown, field: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const item = value[field];
  return isRecord(item) ? item : undefined;
}

function numberField(value: unknown, field: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const item = value[field];
  return typeof item === "number" ? item : undefined;
}

function arrayField(value: unknown, field: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const item = value[field];
  return Array.isArray(item) ? item : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function updateDiagnosticStatus(): void {
  let count = 0;
  for (const value of diagnosticCounts.values()) {
    count += value;
  }
  status?.setDiagnosticCount(count);
}

function expandWorkspacePath(value: string, workspaceRoot: string | undefined): string {
  if (!workspaceRoot) {
    return value;
  }
  return value.replace(/\$\{workspaceFolder\}/g, workspaceRoot);
}

function resolveQtlcPath(value: string, workspaceRoot: string | undefined): string {
  const expanded = expandWorkspacePath(value, workspaceRoot);
  if (expanded !== "qtlc") {
    return expanded;
  }
  return discoverSourceTreeQtlc(workspaceRoot) ?? expanded;
}

function discoverSourceTreeQtlc(workspaceRoot: string | undefined): string | undefined {
  if (!workspaceRoot) {
    return undefined;
  }
  const executableNames =
    process.platform === "win32" ? ["qtlc.exe", "qtlc"] : ["qtlc"];
  const relativeDirs = [
    path.join("build", "compiler", "driver"),
    path.join("qtlc", "build", "compiler", "driver"),
  ];
  let current = path.resolve(workspaceRoot);
  while (true) {
    for (const relativeDir of relativeDirs) {
      for (const executableName of executableNames) {
        const candidate = path.join(current, relativeDir, executableName);
        if (isExecutableFile(candidate)) {
          return candidate;
        }
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

function qtlcServerStartMessage(error: unknown, qtlcPath: string): string {
  const message = errorMessage(error);
  if (message.includes("ENOENT")) {
    return [
      `${message}.`,
      `The qtlc executable was not found at '${qtlcPath}'.`,
      "Set quantumlang.qtlcPath to an installed qtlc binary.",
      "The adapter also auto-detects source-tree builds at",
      "/home/maram/Documents/QLang/quantumlang/qtlc/build/compiler/driver/qtlc.",
    ].join(" ");
  }
  return message;
}

function shortRoot(root: string): string {
  const normalized = root.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts.length === 0 ? normalized : parts[parts.length - 1];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
