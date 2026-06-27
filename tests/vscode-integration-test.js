const vscode = require('vscode');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function exec(cmd) {
  const execSync = require('child_process').execSync;
  try { execSync(cmd, { timeout: 5000 }); } catch(e) { console.log('exec error:', e.message); }
}

async function takeCFGScreenshot(filePath, line, col, label, screenshotName) {
  const doc = await vscode.workspace.openTextDocument(filePath);
  const editor = await vscode.window.showTextDocument(doc);
  const pos = new vscode.Position(line, col);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));
  await sleep(2000);
  console.log(`=== ${label}: triggering CFG at ${filePath}:${line+1}:${col+1} ===`);
  await vscode.commands.executeCommand('codedetective.showCodeFlow');
  await sleep(8000);
  // Use osascript to bring Code to front on the main display
  exec(`osascript -e 'tell application "Visual Studio Code" to activate' 2>/dev/null`);
  await sleep(2000);
  // Capture the screen (all displays)
  exec(`/usr/sbin/screencapture -x /Users/shridharkulkakrni/Desktop/${screenshotName}.png`);
  // Close the webview tab
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await sleep(2000);
}

async function main() {
  // Screenshot 1: repository.py module-level (shows imports as nodes)
  await takeCFGScreenshot(
    '/Users/shridharkulkakrni/ddd_demo/infrastructure/repository.py',
    0, 0, 'repository module mode', 'cfg-repo-module'
  );

  // Screenshot 2: repository.py inside place_order (function mode, imports skipped)
  await takeCFGScreenshot(
    '/Users/shridharkulkakrni/ddd_demo/infrastructure/repository.py',
    27, 4, 'repository place_order', 'cfg-repo-place_order'
  );

  // Screenshot 3: model.py add_item (function mode)
  await takeCFGScreenshot(
    '/Users/shridharkulkakrni/ddd_demo/domain/model.py',
    70, 4, 'model add_item', 'cfg-model-add_item'
  );

  console.log('=== All screenshots captured ===');
}

module.exports = { run: () => main().catch(e => { console.error('FAILED:', e); process.exit(1); }) };

module.exports = { run: () => main().catch(e => { console.error('FAILED:', e); process.exit(1); }) };
