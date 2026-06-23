import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';

export interface IndexEntry {
  name: string;
  uri: vscode.Uri;
  source: string;
  node: Parser.SyntaxNode;
}

export class WorkspaceIndex {
  private index = new Map<string, IndexEntry[]>();
  private ready = false;

  async build(parser: Parser): Promise<void> {
    this.index.clear();

    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;

    const pyFiles = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**');
    
    for (const uri of pyFiles) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const src = doc.getText();
        const tree = parser.parse(src);
        this.indexFile(uri, src, tree.rootNode);
      } catch {
        // skip files that can't be read
      }
    }

    this.ready = true;
  }

  private indexFile(uri: vscode.Uri, source: string, root: Parser.SyntaxNode): void {
    const visit = (node: Parser.SyntaxNode) => {
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = nameNode.text;
          const entries = this.index.get(name) ?? [];
          entries.push({ name, uri, source, node });
          this.index.set(name, entries);
        }
      }
      for (const child of node.namedChildren) {
        visit(child);
      }
    };
    visit(root);
  }

  resolve(name: string, currentFile?: vscode.Uri): IndexEntry | undefined {
    const entries = this.index.get(name);
    if (!entries || entries.length === 0) return undefined;

    // Prefer same-directory definition
    if (currentFile) {
      const currentDir = currentFile.fsPath.replace(/\/[^/]+$/, '');
      const sameDir = entries.find(e => e.uri.fsPath.startsWith(currentDir));
      if (sameDir) return sameDir;
    }

    return entries[0];
  }

  resolveByModule(moduleName: string, funcName: string, currentFile?: vscode.Uri): IndexEntry | undefined {
    const entries = this.index.get(funcName);
    if (!entries) return undefined;

    const modulePath = moduleName.replace(/\./g, '/');
    const match = entries.find(e => e.uri.fsPath.includes(modulePath));
    if (match) return match;

    return this.resolve(funcName, currentFile);
  }

  isReady(): boolean { return this.ready; }
}
