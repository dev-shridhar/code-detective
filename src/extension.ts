import * as vscode from 'vscode';
import { ensureParser, enclosingFunction } from './parser';
import { buildCfg } from './cfg/builder';
import { CodeFlowPanel } from './panel';

let currentPanel: CodeFlowPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeflow.showProcedural', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'python') {
        vscode.window.showInformationMessage('Place the cursor inside a Python function.');
        return;
      }

      const parser = await ensureParser(context);
      const tree = parser.parse(editor.document.getText());
      const offset = editor.document.offsetAt(editor.selection.active);

      const fnNode = enclosingFunction(tree.rootNode, offset);
      if (!fnNode) {
        vscode.window.showInformationMessage('Cursor is not inside a function.');
        return;
      }

      const cfg = buildCfg(fnNode, {
        getText: () => editor.document.getText(),
        offsetAt: (pos) => editor.document.offsetAt(new vscode.Position(pos.line, pos.character)),
        positionAt: (offset) => {
          const pos = editor.document.positionAt(offset);
          return { line: pos.line, character: pos.character };
        },
      });

      if (currentPanel) {
        currentPanel.dispose();
      }
      currentPanel = CodeFlowPanel.create(context, editor.document.uri, cfg, (range) => {
        if (range) {
          const start = new vscode.Position(range.startLine, range.startCol);
          const end = new vscode.Position(range.endLine, range.endCol);
          editor.selection = new vscode.Selection(start, end);
          editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
        }
      });
    })
  );
}

export function deactivate() {}
