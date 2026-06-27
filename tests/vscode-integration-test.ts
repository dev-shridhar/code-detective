import * as vscode from 'vscode';
import * as path from 'path';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const testDir = path.resolve(__dirname, '.');
  const modelPy = path.join(testDir, '..', 'ddd_demo', 'domain', 'model.py');

  // Open the test file
  const doc = await vscode.workspace.openTextDocument(modelPy);
  const editor = await vscode.window.showTextDocument(doc);

  // Move cursor to Order.add_item method (line 71)
  const pos = new vscode.Position(70, 4); // 0-indexed
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));

  await sleep(500);

  // Execute CFG command
  console.log('=== Triggering codedetective.showCodeFlow ===');
  await vscode.commands.executeCommand('codedetective.showCodeFlow');
  await sleep(2000);

  // Execute ERD command  
  console.log('=== Triggering codedetective.showErd ===');
  await vscode.commands.executeCommand('codedetective.showErd');
  await sleep(2000);

  console.log('=== Smoke test completed successfully ===');
}

main().catch(e => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
