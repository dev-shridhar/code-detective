import Parser from 'web-tree-sitter';
import { buildCfg } from '../src/cfg/builder';
import { WorkspaceIndex } from '../src/indexer';
import { ClassIndex } from '../src/class-indexer';
import { resolveCall, ResolvedCall } from '../src/resolver';
import { TypeEnv } from '../src/type-env';
import path from 'path';
import fs from 'fs';

const TEST_DIR = path.resolve(__dirname, '.');

interface DrillCase {
  file: string;          // file containing the function
  fnName: string;        // function to build CFG for
  checks: {
    nodeLabel: string;           // substring match in node label
    expectResolvedName?: string; // expected callee name if call resolves
    expectNoResolve?: boolean;   // true = call found but unresolvable (external/builtin)
    expectNoCall?: boolean;      // true = no call expression at click position (falls to enclosing fn)
  }[];
}

const cases: DrillCase[] = [
  {
    file: 'test_ddd_main.py',
    fnName: 'main',
    checks: [
      // Cross-file constructor calls from main.py
      { nodeLabel: 'call OrderRepository', expectResolvedName: 'OrderRepository' },
      { nodeLabel: 'call OrderService', expectResolvedName: 'OrderService' },
      { nodeLabel: 'call OrderController', expectResolvedName: 'OrderController' },
      // Cross-file method call: controller.create(...)
      { nodeLabel: 'call create', expectResolvedName: 'create' },
      // Inside inlined create: order = self.service.place(payload) — same-file inline
      { nodeLabel: 'call place', expectResolvedName: 'place' },
      // Inside inlined place: object() — builtin, no resolution
      { nodeLabel: 'object()', expectNoResolve: true },
      // Inside inlined place: OrderService.repo.save(order) — depth=2, not inlined, full label preserved
      { nodeLabel: 'OrderService.repo.save(order)', expectResolvedName: 'save' },
      // print(result) — builtin, no resolution
      { nodeLabel: 'print(result)', expectNoResolve: true },
    ],
  },
  {
    file: 'test_ddd_main.py',
    fnName: 'alternate',
    checks: [
      { nodeLabel: 'call OrderService', expectResolvedName: 'OrderService' },
      { nodeLabel: 'call place', expectResolvedName: 'place' },
    ],
  },
  {
    file: 'test_method.py',
    fnName: 'process',
    checks: [
      { nodeLabel: 'call lookup', expectResolvedName: 'lookup' },
    ],
  },
  {
    file: 'test_simple.py',
    fnName: 'process',
    checks: [
      { nodeLabel: 'transform', expectResolvedName: 'transform' },
    ],
  },
  {
    file: 'test_ddd_service.py',
    fnName: 'place',
    checks: [
      { nodeLabel: 'object()', expectNoResolve: true },
      { nodeLabel: 'call save', expectResolvedName: 'save' },
    ],
  },
  {
    file: 'test_control_flow.py',
    fnName: 'classify',
    checks: [
      // Just a return statement, no call — should fall through
      { nodeLabel: 'return "positive"', expectNoCall: true },
    ],
  },
];

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) passed++; else { failed++; console.error(`FAIL: ${msg}`); }
}

function walkUp(n: any, types: string[]): any {
  while (n) {
    if (types.includes(n.type)) return n;
    n = n.parent;
  }
  return null;
}

function findCallDescendant(n: any): any {
  if (!n) return null;
  if (n.type === 'call') return n;
  for (const child of n.namedChildren) {
    const found = findCallDescendant(child);
    if (found) return found;
  }
  return null;
}

function makeDoc(src: string) {
  return {
    getText: () => src,
    offsetAt: (pos: any) =>
      pos.line === 0 ? pos.character : src.split('\n').slice(0, pos.line).reduce((a, l) => a + l.length + 1, 0) + pos.character,
    positionAt: (offset: number) => {
      let line = 0, col = 0;
      for (let i = 0; i < offset && i < src.length; i++) {
        if (src[i] === '\n') { line++; col = 0; } else col++;
      }
      return { line, character: col };
    },
  };
}

async function main() {
  const wasmDir = path.resolve(__dirname, '..', 'node_modules', 'web-tree-sitter');
  await Parser.init({ locateFile: (p: string) => path.resolve(wasmDir, p) });
  const parser = new Parser();
  const pyWasm = path.resolve(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-python.wasm');
  const Python = await Parser.Language.load(pyWasm);
  parser.setLanguage(Python);

  // Index ALL test files
  const index = new WorkspaceIndex();
  const classIndex = new ClassIndex();
  const allFiles = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.py'));
  // also parse all .py files for the index
  const fileCache = new Map<string, { src: string; tree: Parser.Tree }>();
  for (const f of allFiles) {
    const fp = path.join(TEST_DIR, f);
    const src = fs.readFileSync(fp, 'utf-8');
    const tree = parser.parse(src);
    fileCache.set(fp, { src, tree });
    const uri = { fsPath: fp, toString: () => `file://${fp}`, with: () => ({}) } as any;
    index.indexFile(uri, src, tree.rootNode);
    classIndex.build(uri, src, tree.rootNode);
  }

  console.log('File cache:\n  ' + Array.from(fileCache.keys()).join('\n  ') + '\n');

  for (const tc of cases) {
    const filePath = path.join(TEST_DIR, tc.file);
    const { src, tree } = fileCache.get(filePath)!;
    const uri = `file://${filePath}`;

    // Find the function
    function findFn(node: any, name: string): any | null {
      if ((node.type === 'function_definition' || node.type === 'class_definition') && node.childForFieldName('name')?.text === name) return node;
      for (const child of node.namedChildren) { const f = findFn(child, name); if (f) return f; }
      return null;
    }
    const fnNode = findFn(tree.rootNode, tc.fnName);
    if (!fnNode) { console.error(`  Function ${tc.fnName} not found in ${tc.file}`); continue; }

    const doc = makeDoc(src);
    const cfg = buildCfg(fnNode, doc, index, uri, classIndex, false);

    console.log(`\n--- ${tc.file} ${tc.fnName} (${cfg.nodes.length} nodes) ---`);

    for (const check of tc.checks) {
      const node = cfg.nodes.find(n => n.label.includes(check.nodeLabel));
      if (!node) {
        console.error(`  Node "${check.nodeLabel}" NOT FOUND in CFG`);
        console.log(`  Available labels: ${cfg.nodes.map(n => JSON.stringify(n.label)).join(', ')}`);
        failed++;
        continue;
      }
      if (!node.range) {
        console.error(`  Node "${check.nodeLabel}" has no range`);
        failed++;
        continue;
      }

      // Determine which file to parse based on the range's uri
      const rangeUri = (node.range as any).uri;
      let resolveFile = filePath;
      if (rangeUri) {
        const parsed = rangeUri.replace(/^file:\/\//, '');
        if (fileCache.has(parsed)) resolveFile = parsed;
        else {
          // try matching by fsPath format
          for (const k of fileCache.keys()) {
            if (rangeUri.includes(k) || k.includes(rangeUri)) { resolveFile = k; break; }
          }
        }
      }

      const { src: clickSrc, tree: clickTree } = fileCache.get(resolveFile)!;
      const clickDoc = makeDoc(clickSrc);

      // Simulate click: find descendant at range position
      const offset = clickDoc.offsetAt({ line: node.range.startLine, character: node.range.startCol });
      const descendant = clickTree.rootNode.descendantForIndex(offset) as any;

      let callNode = walkUp(descendant, ['call']);
      if (!callNode) {
        let stmt = walkUp(descendant, ['expression_statement', 'assignment', 'return_statement']);
        if (!stmt) stmt = descendant;
        callNode = findCallDescendant(stmt);
      }

      if (!callNode) {
        if (check.expectNoCall) {
          console.log(`  ✓ "${check.nodeLabel}" — no call (expected)`);
          assert(true, `${tc.file} ${tc.fnName}: "${check.nodeLabel}" — no call as expected`);
          continue;
        }
        const fnEnclosing = walkUp(descendant, ['function_definition', 'class_definition']);
        const enclosingName = fnEnclosing?.childForFieldName('name')?.text;
        console.log(`  ? "${check.nodeLabel}" — no call found, enclosing fn="${enclosingName}"`);
        assert(false, `${tc.file} ${tc.fnName}: "${check.nodeLabel}" — expected a call but none found`);
        continue;
      }

      // Build TypeEnv same as handleDrillIn
      const tenv = new TypeEnv();
      const fn = walkUp(descendant, ['function_definition', 'async_function_definition']);
      if (fn) {
        const cls = walkUp(descendant, ['class_definition']);
        if (cls) {
          const cn = cls.childForFieldName('name');
          if (cn) tenv.set('self', cn.text);
        }
        const params = fn.childForFieldName('parameters');
        if (params) {
          for (const p of params.namedChildren) {
            const pName = p.child(0)?.text;
            const pType = p.childForFieldName('type')?.text;
            if (pName && pType && pName !== 'self' && pName !== 'cls') tenv.set(pName, pType);
          }
        }
        const body = fn.childForFieldName('body');
        if (body) {
          for (const stmt of body.namedChildren) tenv.trackAssignment(stmt);
        }
      }

      const resolved = resolveCall(
        callNode,
        { fsPath: resolveFile, toString: () => `file://${resolveFile}`, with: () => ({}) } as any,
        index, classIndex, tenv,
      );
      const resolvedName = resolved?.entry?.name;

      if (check.expectNoResolve) {
        if (!resolved) {
          console.log(`  ✓ "${check.nodeLabel}" — no resolution (external/builtin, expected)`);
          assert(true, `${tc.file} ${tc.fnName}: "${check.nodeLabel}" — no resolution as expected`);
        } else {
          console.log(`  ✗ "${check.nodeLabel}" — unexpectedly resolved to "${resolvedName}"`);
          assert(false, `${tc.file} ${tc.fnName}: "${check.nodeLabel}" — expected no resolution, got "${resolvedName}"`);
        }
      } else if (check.expectResolvedName) {
        assert(
          resolvedName === check.expectResolvedName,
          `${tc.file} ${tc.fnName}: click "${check.nodeLabel}" → expected resolved "${check.expectResolvedName}", got "${resolvedName}"`,
        );
        if (resolvedName) console.log(`  ✓ "${check.nodeLabel}" → resolves to "${resolvedName}"`);
        else console.log(`  ✗ "${check.nodeLabel}" → expected resolved "${check.expectResolvedName}", got undefined`);
      } else {
        assert(false, `${tc.file} ${tc.fnName}: "${check.nodeLabel}" — unexpected state`);
      }
    }
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
