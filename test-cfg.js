const Parser = require('web-tree-sitter');
const path = require('path');
const fs = require('fs');
const { WorkspaceIndex } = require('./dist/extension');
const { ClassIndex } = require('./dist/extension');
const { buildCfg } = require('./dist/extension');
const { resolveCall } = require('./dist/extension');

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
  await workspaceIndex.build(parser, classIndex, demoDir);

  // Find the main function
  const root = tree.rootNode;
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child.type === 'function_definition') {
      const nameNode = child.childForFieldName('name');
      if (nameNode && nameNode.text === 'main') {
        console.log('\n=== main() CFG ===');
        // Build CFG with moduleMode to get full function body
        const cfg = buildCfg(child, parser, src, workspaceIndex, classIndex, {
          currentFileUri: demoDir + '/main.py',
          moduleMode: true,
        });
        console.log('\nNodes:');
        for (const n of cfg.nodes) {
          console.log(`  ${n.id} [${n.kind}] "${n.label?.substring(0, 60)}"${n.drillable ? ' DRILLABLE' : ''}${n.range ? ' range:' + JSON.stringify(n.range) : ''}`);
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
