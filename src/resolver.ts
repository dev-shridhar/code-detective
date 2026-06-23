import Parser from 'web-tree-sitter';
import * as vscode from 'vscode';
import { WorkspaceIndex, IndexEntry } from './indexer';

export interface ResolvedCall {
  entry: IndexEntry;
}

export function resolveCall(
  callNode: Parser.SyntaxNode,
  currentFile: vscode.Uri | undefined,
  index: WorkspaceIndex,
): ResolvedCall | undefined {
  const func = callNode.childForFieldName('function');
  if (!func) return undefined;

  if (func.type === 'identifier') {
    const name = func.text;
    const entry = index.resolve(name, currentFile);
    return entry ? { entry } : undefined;
  }

  if (func.type === 'attribute') {
    const obj = func.childForFieldName('object');
    const attr = func.childForFieldName('attribute');
    if (!obj || !attr) return undefined;

    const moduleName = obj.text;
    const funcName = attr.text;

    if (moduleName === 'self' || moduleName === 'cls') return undefined;

    const entry = index.resolveByModule(moduleName, funcName, currentFile);
    return entry ? { entry } : undefined;
  }

  return undefined;
}
