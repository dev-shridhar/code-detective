const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const production = args.includes('--production');

async function build() {
  const ctx = await esbuild.context({
    entryPoints: {
      extension: 'src/extension.ts',
      'webview/main': 'webview/main.ts',
    },
    outdir: 'dist',
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: !production,
    minify: production,
    plugins: [],
  });

  if (watch) {
    await ctx.watch();
    console.log('[esbuild] watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[esbuild] build complete');
  }

  fs.cpSync('webview/style.css', 'dist/webview/style.css', { recursive: true });
  fs.mkdirSync('media', { recursive: true });
  fs.cpSync('node_modules/tree-sitter-wasms/out/tree-sitter-python.wasm', 'media/tree-sitter-python.wasm');
  fs.cpSync('node_modules/web-tree-sitter/tree-sitter.wasm', 'dist/tree-sitter.wasm');
  console.log('[esbuild] assets copied');
}

build().catch(e => {
  console.error(e);
  process.exit(1);
});
