import Parser from 'web-tree-sitter';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal vscode mock
const Uri = {
  file: (f) => ({ fsPath: f, toString: () => f, scheme: 'file', path: f }),
  parse: (s) => ({ fsPath: s, toString: () => s }),
};

global.vscode = {
  Uri,
  workspace: { workspaceFolders: null },
  window: { showInformationMessage: () => {} },
};

const { WorkspaceIndex, ClassIndex } = await import('./dist/extension.js');
const { buildCfg, resolveCall } = await import('./dist/extension.js');

async function main() {
  await Parser.init({
    locateFile(script) {
      return path.join(__dirname, 'dist', script);
    }
  });

  const parser = new Parser();
  const Lang = await Parser.Language.load(
    path.join(__dirname, 'media/tree-sitter-python.wasm')
  );
  parser.setLanguage(Lang);

  const demoDir = '/Users/shridharkulkakrni/ddd_demo';
  const src = fs.readFileSync(path.join(demoDir, 'main.py'), 'utf-8');
  const tree = parser.parse(src);

  const workspaceIndex = new WorkspaceIndex();
  const classIndex = new ClassIndex();

  // Manually index all .py files
  const pyFiles = [];
  function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (f.endsWith('.py')) pyFiles.push(fp);
    }
  }
  walk(demoDir);

  for (const fp of pyFiles) {
    const uri = Uri.file(fp);
    const srcText = fs.readFileSync(fp, 'utf-8');
    const t = parser.parse(srcText);
    workspaceIndex.indexFile(uri, srcText, t.rootNode);
    classIndex.build(uri, srcText, t.rootNode);
  }

  // Build CFG for main()
  const root = tree.rootNode;
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child.type === 'function_definition') {
      const nameNode = child.childForFieldName('name');
      if (nameNode && nameNode.text === 'main') {
        const cfg = buildCfg(child, {
          getText: () => src,
          offsetAt: (pos) => {
            const lines = src.split('\n');
            let o = 0;
            for (let i = 0; i < pos.line && i < lines.length; i++) o += lines[i].length + 1;
            return o + pos.character;
          },
          positionAt: (offset) => {
            const text = src;
            let line = 0, col = 0;
            for (let i = 0; i < offset && i < text.length; i++) {
              if (text[i] === '\n') { line++; col = 0; }
              else col++;
            }
            return { line, character: col };
          },
        }, workspaceIndex, Uri.file(path.join(demoDir, 'main.py')), classIndex, true);

        console.log('\n=== main() CFG ===');
        console.log('Nodes:');
        for (const n of cfg.nodes) {
          console.log(`  ${n.id} [${n.kind}] "${(n.label || '').substring(0, 70)}"${n.drillable ? ' DRILLABLE' : ''}${n.range ? ' uri=' + (n.range.uri || '').substring(0, 40) : ''}`);
        }
        console.log('\nEdges:');
        for (const e of cfg.edges) {
          console.log(`  ${e.from} -> ${e.to}${e.kind ? ' [' + e.kind + ']' : ''}`);
        }
        break;
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
