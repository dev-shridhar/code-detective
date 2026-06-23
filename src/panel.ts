import * as vscode from 'vscode';
import { Cfg, SrcRange } from './cfg/model';

export class CodeFlowPanel {
  static readonly viewType = 'codeflow.procedural';

  private constructor(
    private panel: vscode.WebviewPanel,
    private onReveal: (range: SrcRange | undefined) => void,
  ) {
    this.panel.onDidChangeViewState(() => this.update());
    this.panel.onDidDispose(() => this.dispose());
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'reveal') {
        this.onReveal(msg.range);
      }
    });
  }

  static create(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    cfg: Cfg,
    onReveal: (range: SrcRange | undefined) => void,
  ): CodeFlowPanel {
    const panel = vscode.window.createWebviewPanel(
      CodeFlowPanel.viewType,
      'Procedural CodeFlow',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
        ],
      },
    );

    const instance = new CodeFlowPanel(panel, onReveal);
    instance.render(cfg);
    return instance;
  }

  dispose() {
    this.panel.dispose();
  }

  private render(cfg: Cfg) {
    const panel = this.panel;
    const webview = panel.webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(panel.extensionUri, 'dist', 'webview', 'main.js'),
    );

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval';">
  <link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(panel.extensionUri, 'dist', 'webview', 'style.css'))}">
  <title>Procedural CodeFlow</title>
</head>
<body>
  <div id="root"></div>
  <script>
    const __CFG__ = ${JSON.stringify(cfg)};
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  private update() {
    if (this.panel.visible) {
      this.render(/* current cfg */);
    }
  }
}
