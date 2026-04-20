import * as vscode from "vscode";

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export interface QtlcDiagnostic {
  range?: QtlcRange;
  severity?: number;
  code?: string;
  message?: string;
  source?: string;
}

export interface QtlcRange {
  start: QtlcPosition;
  end: QtlcPosition;
}

export interface QtlcPosition {
  line: number;
  character: number;
}

export interface QtlcPublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics?: QtlcDiagnostic[];
  qtlc?: unknown;
}

export interface QtlcMemoryPressureParams {
  request_id?: string;
  method?: string;
  severity?: string;
  message?: string;
  diagnostics?: QtlcDiagnostic[];
  evicted_checked_source_count?: number;
  total_checked_source_evictions?: number;
  checked_source_cache_size?: number;
  checked_source_cache_max_size?: number;
  source_snapshot_count?: number;
  total_source_snapshot_byte_size?: number;
  code_action_cache_evicted_count?: number;
  code_action_cache_total_evictions?: number;
  code_action_cache_size?: number;
  code_action_cache_max_size?: number;
}

export function documentSelector(): vscode.DocumentSelector {
  return [{ language: "quantumlang", scheme: "file" }];
}

export function textDocumentIdentifier(
  document: vscode.TextDocument,
): { uri: string; version?: number } {
  return {
    uri: document.uri.toString(),
    version: document.version,
  };
}

export function textDocumentPositionParams(
  document: vscode.TextDocument,
  position: vscode.Position,
): unknown {
  return {
    textDocument: textDocumentIdentifier(document),
    position: {
      line: position.line,
      character: position.character,
    },
  };
}

export function vscodeRange(range: QtlcRange | undefined): vscode.Range {
  if (!range) {
    return new vscode.Range(0, 0, 0, 0);
  }
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  );
}
