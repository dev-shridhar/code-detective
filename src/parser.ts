import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';

let parserPromise: Promise<Parser> | undefined;

export function ensureParser(ctx: vscode.ExtensionContext): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      const wasmDir = vscode.Uri.joinPath(ctx.extensionUri, 'dist');
      await Parser.init({
        locateFile(scriptPath: string) {
          return vscode.Uri.joinPath(wasmDir, scriptPath).fsPath;
        },
      });
      const parser = new Parser();
      const wasmPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'tree-sitter-python.wasm');
      const Python = await Parser.Language.load(wasmPath.fsPath);
      parser.setLanguage(Python);
      return parser;
    })();
  }
  return parserPromise;
}

export interface TextDocLike {
  getText(): string;
  offsetAt(pos: { line: number; character: number }): number;
  positionAt(offset: number): { line: number; character: number };
}

export function enclosingFunction(root: Parser.SyntaxNode, offset: number): Parser.SyntaxNode | null {
  let node: Parser.SyntaxNode | null = root.descendantForIndex(offset);
  while (node) {
    if (node.type === 'function_definition') return node;
    node = node.parent;
  }
  return null;
}

export function functionDocs(fn: Parser.SyntaxNode, src: string) {
  const params = fn.childForFieldName('parameters');
  const name = fn.childForFieldName('name')?.text ?? '';
  const ret = fn.childForFieldName('return_type');
  const signature = `${name}${params?.text ?? '()'}${ret ? ' -> ' + ret.text : ''}`;

  const body = fn.childForFieldName('body');
  const first = body?.firstNamedChild;
  let docstring: string | undefined;
  if (first?.type === 'expression_statement' && first.firstNamedChild?.type === 'string') {
    docstring = stripPyQuotes(first.firstNamedChild.text);
  }
  return { signature, docstring, params: readParams(params) };
}

function stripPyQuotes(s: string): string {
  return s.replace(/^['"]{3}|['"]{3}$/g, '').replace(/^['"]|['"]$/g, '');
}

function readParams(params: Parser.SyntaxNode | null): Array<{ name: string; type?: string; default?: string }> {
  if (!params) return [];
  const result: Array<{ name: string; type?: string; default?: string }> = [];
  for (const child of params.namedChildren) {
    if (child.type === 'identifier') {
      result.push({ name: child.text });
    } else if (child.type === 'default_parameter') {
      const name = child.childForFieldName('name')?.text ?? '';
      const value = child.childForFieldName('value')?.text;
      result.push({ name, default: value });
    } else if (child.type === 'typed_parameter') {
      const name = child.childForFieldName('name')?.text ?? '';
      const type = child.childForFieldName('type')?.text;
      result.push({ name, type });
    }
  }
  return result;
}
