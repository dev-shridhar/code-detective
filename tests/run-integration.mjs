#!/usr/bin/env node
import { runTests } from '@vscode/test-electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'vscode-integration-test.js');

  const vscodePath = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath: vscodePath,
      launchArgs: [
        '/Users/shridharkulkakrni/ddd_demo',
      ],
    });
    console.log('Integration tests passed');
  } catch (e) {
    console.error('Integration tests failed:', e);
    process.exit(1);
  }
}

main();
