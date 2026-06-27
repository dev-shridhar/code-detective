import Parser from 'web-tree-sitter';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await Parser.init({ locateFile: p => path.resolve(__dirname, '..', 'node_modules', 'web-tree-sitter', p) });
  const p = new Parser();
  const L = await Parser.Language.load(path.resolve(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-python.wasm'));
  p.setLanguage(L);

  const src = fs.readFileSync(path.resolve(__dirname, 'test_try_match.py'), 'utf-8');
  const t = p.parse(src);
  const r = t.rootNode;

  function dump(n, indent = 0) {
    const s = ' '.repeat(indent * 2);
    let info = `${s}${n.type}`;
    if (n.startPosition && n.endPosition) {
      info += ` [${n.startPosition.row}:${n.startPosition.column} - ${n.endPosition.row}:${n.endPosition.column}]`;
    }
    // Show all children
    const namedChildren = n.namedChildren;
    const namedTypes = namedChildren.map(c => c.type).join(', ');
    info += namedChildren.length > 0 ? ` children=[${namedTypes}]` : '';
    // Try to get fields
    const children = n.children;
    const childTypes = children.map(c => c.type).join(', ');
    info += ` total_children=[${childTypes}]`;
    console.log(info);
    for (const c of namedChildren) {
      dump(c, indent + 1);
    }
  }

  // Find safe_divide function
  function find(node, type) {
    if (node.type === type) return node;
    for (const c of node.namedChildren) { const f = find(c, type); if (f) return f; }
    return null;
  }

  const fn = find(r, 'function_definition');
  if (fn) {
    console.log('\n=== safe_divide AST ===');
    dump(fn);
  }

  // Find handle function
  function findAll(node, type, results = []) {
    if (node.type === type) results.push(node);
    for (const c of node.namedChildren) findAll(c, type, results);
    return results;
  }

  const handles = findAll(r, 'function_definition');
  const handle = handles[1];
  if (handle) {
    console.log('\n=== handle AST ===');
    dump(handle);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
