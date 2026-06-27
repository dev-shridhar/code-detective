#!/usr/bin/env node
import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build the test runner (bundles the builder with vscode mock injected)
const plugin = {
  name: 'mock-vscode',
  setup(build) {
    build.onResolve({ filter: /^vscode$/ }, () => {
      return { path: path.join(__dirname, 'vscode-mock.ts') };
    });
  },
};

const makeConfig = (entry, out) => ({
  entryPoints: [path.join(__dirname, entry)],
  outfile: path.join(__dirname, out),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  sourcemap: false,
  minify: false,
  plugins: [plugin],
});

const baseConfig = (entry, out) => ({
  entryPoints: [path.join(__dirname, entry)],
  outfile: path.join(__dirname, out),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  sourcemap: false,
  minify: false,
});

async function build() {
  await esbuild.build(makeConfig('runner.ts', 'runner.bundle.cjs'));
  console.log('runner built');
  await esbuild.build(makeConfig('test_drill_in.ts', 'drill_in.bundle.cjs'));
  console.log('drill-in test built');
  await esbuild.build(baseConfig('webview_test.ts', 'webview.bundle.cjs'));
  console.log('webview test built');
}

build().catch(e => { console.error(e); process.exit(1); });
