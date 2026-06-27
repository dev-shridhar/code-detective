import Parser from 'web-tree-sitter';
import { buildCfg } from '../src/cfg/builder';
import { WorkspaceIndex } from '../src/indexer';
import { ClassIndex } from '../src/class-indexer';
import path from 'path';
import fs from 'fs';

const TEST_DIR = path.resolve(__dirname, '.');

interface TestCase {
  file: string;
  fnName?: string;        // function/class name to extract; omit = whole file module mode
  moduleMode?: boolean;
  description: string;
}

const testCases: TestCase[] = [
  // Simple cases
  { file: 'test_simple.py', fnName: 'process', description: 'simple function call: process calls transform' },
  { file: 'test_simple.py', moduleMode: true, description: 'module mode: shows both functions as drillable' },
  { file: 'test_control_flow.py', fnName: 'classify', description: 'if/elif/else control flow' },
  { file: 'test_control_flow.py', fnName: 'sum_until', description: 'for loop with break' },
  { file: 'test_control_flow.py', fnName: 'find', description: 'while loop with continue + return' },
  { file: 'test_control_flow.py', fnName: 'loop_with_if_first', description: 'for loop body starts with if (true-edge marking)' },
  { file: 'test_control_flow.py', fnName: 'while_with_if_first', description: 'while loop body starts with if (true-edge marking)' },
  { file: 'test_try_match.py', fnName: 'safe_divide', description: 'try/except/finally' },
  { file: 'test_try_match.py', fnName: 'handle', description: 'match/case' },
  { file: 'test_try_match.py', fnName: 'with_finally_return', description: 'try/finally with return (exit stack test)' },
  { file: 'test_try_match.py', fnName: 'with_finally_return_except', description: 'try/except/finally with return in both try and handler' },

  // Method calls with TypeEnv-based resolution
  { file: 'test_method.py', fnName: 'lookup', description: 'self.repo.find(user_id) — attribute call resolves via TypeEnv' },
  { file: 'test_method.py', fnName: 'process', description: 'self.lookup() — self-method call resolves via ClassIndex' },
  { file: 'test_constructor.py', fnName: 'drive', description: 'Engine("V8") — constructor call inlines __init__ body' },
  { file: 'test_constructor.py', moduleMode: true, description: 'module mode: Car + Engine classes as drillable' },

  // Cross-module calls (json.loads is external, helper is local)
  { file: 'test_module.py', fnName: 'process', description: 'json.loads + helper() — mixed local/external resolution' },
  { file: 'test_module.py', moduleMode: true, description: 'module mode: helper + process + Calculator' },

  // DDD-style service layer: constructor chain, cross-file resolution
  { file: 'test_ddd_service.py', fnName: 'OrderService.__init__', description: '[DDD] OrderService(repo) — constructor param + self.repo assignment' },
  { file: 'test_ddd_service.py', fnName: 'place', description: '[DDD] service.place: self.repo.save(order) — cross-class method call' },
  { file: 'test_ddd_service.py', fnName: 'create', description: '[DDD] controller.create: self.service.place() — chain resolve' },
  { file: 'test_ddd_main.py', fnName: 'main', description: '[DDD] main: OrderService(repo) → OrderController(service) → controller.create()' },
  { file: 'test_ddd_main.py', fnName: 'alternate', description: '[DDD] OrderService(OrderRepository()) — nested constructor' },

  // Regression tests from test_bugs.py
  { file: 'test_bugs.py', fnName: 'multiple_paths_try', description: 'try body with if-else (multiple frontier → exception edges)' },
  { file: 'test_bugs.py', fnName: 'match_with_returns', description: 'match/case all arms return (case edge kind + terminator)' },

  // Edge cases: raise, async, imports inside functions, decorated nested
  { file: 'test_edge_cases.py', fnName: 'with_raise', description: 'raise statement' },
  { file: 'test_edge_cases.py', fnName: 'async_func', description: 'async def with await' },
  { file: 'test_edge_cases.py', fnName: 'async_loop', description: 'async for loop' },
  { file: 'test_edge_cases.py', fnName: 'async_with_block', description: 'async with block' },
  { file: 'test_edge_cases.py', fnName: 'with_import_inside', description: 'import inside function body (should propagate)' },
  { file: 'test_edge_cases.py', fnName: 'with_decorated_nested', description: 'decorated nested function' },
];

function indent(n: number) { return '  '.repeat(n); }

function printCfg(cfg: any, description: string) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`TEST: ${description}`);
  console.log(`Layout: ${cfg.layout ?? 'cfg'}`);
  console.log(`Nodes (${cfg.nodes.length}):`);
  for (const n of cfg.nodes) {
    const label = n.label?.replace(/\n/g, '\\n').substring(0, 80) ?? '';
    const extra = [n.kind, n.drillable ? 'drillable' : '', n.entityKind ?? ''].filter(Boolean).join(', ');
    console.log(`  ${n.id.padEnd(12)} ${extra.padEnd(25)} ${label}`);
  }
  console.log(`Edges (${cfg.edges.length}):`);
  for (const e of cfg.edges) {
    console.log(`  ${e.from} → ${e.to}${e.label ? `  [${e.label}]` : ''}  (${e.kind})`);
  }
  if (cfg.regions.length > 0) {
    console.log(`Regions (${cfg.regions.length}):`);
    for (const r of cfg.regions) {
      const members = r.memberIds.join(', ');
      console.log(`  ${r.id}: header=${r.headerId}, members=[${members}], kind=${r.kind}`);
    }
  }
}

function printHeader(text: string) {
  console.log(`\n${'█'.repeat(72)}\n█ ${text}\n${'█'.repeat(72)}`);
}

async function main() {
  printHeader('INITIALIZING TREE-SITTER');
  const wasmDir = path.resolve(__dirname, '..', 'node_modules', 'web-tree-sitter');
  await Parser.init({
    locateFile: (scriptPath: string) => path.resolve(wasmDir, scriptPath),
  });
  const parser = new Parser();
  const pyWasm = path.resolve(__dirname, '..', 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-python.wasm');
  const Python = await Parser.Language.load(pyWasm);
  parser.setLanguage(Python);

  const index = new WorkspaceIndex();
  const classIndex = new ClassIndex();

  // Index all test files
  printHeader('INDEXING TEST FILES');
  for (const tc of testCases) {
    const filePath = path.join(TEST_DIR, tc.file);
      const src = fs.readFileSync(filePath, 'utf-8');
      const tree = parser.parse(src);
      const uri = { fsPath: filePath, toString: () => `file://${filePath}`, with: () => ({}) } as any;
      index.indexFile(uri, src, tree.rootNode);
      classIndex.build(uri, src, tree.rootNode);
  }

  printHeader('RUNNING TESTS');
  for (const tc of testCases) {
    const filePath = path.join(TEST_DIR, tc.file);
      const src = fs.readFileSync(filePath, 'utf-8');
    const tree = parser.parse(src);
    const uri = filePath;

    let fnNode: any;

    if (tc.fnName) {
      // Support ClassName.methodName syntax for finding __init__ etc
      let findName = tc.fnName;
      let scopeNode: any = tree.rootNode;
      if (tc.fnName.includes('.')) {
        const parts = tc.fnName.split('.');
        const clsName = parts[0];
        const methodName = parts[1];
        // Find class
        const findClass = (node: any): any | null => {
          if (node.type === 'class_definition' && node.childForFieldName('name')?.text === clsName) return node;
          for (const child of node.namedChildren) { const f = findClass(child); if (f) return f; }
          return null;
        };
        const cls = findClass(tree.rootNode);
        if (!cls) { console.log(`\nWARNING: class ${clsName} not found in ${tc.file}`); continue; }
        // Find method inside class
        const findMethod = (node: any): any | null => {
          if (node.type === 'function_definition' && node.childForFieldName('name')?.text === methodName) return node;
          for (const child of node.namedChildren) { const f = findMethod(child); if (f) return f; }
          return null;
        };
        fnNode = findMethod(cls);
        findName = methodName;
      } else {
        const find = (node: any, name: string): any | null => {
          if ((node.type === 'function_definition' || node.type === 'async_function_definition' || node.type === 'class_definition') && node.childForFieldName('name')?.text === name) return node;
          for (const child of node.namedChildren) { const found = find(child, name); if (found) return found; }
          return null;
        };
        fnNode = find(tree.rootNode, tc.fnName);
      }
      if (!fnNode) {
        console.log(`\nWARNING: ${tc.fnName} not found in ${tc.file}`);
        continue;
      }
    }

    const isModuleMode = tc.moduleMode ?? !fnNode;
    const node = fnNode ?? tree.rootNode;

    const cfg = buildCfg(
      node,
      {
        getText: () => src,
        offsetAt: (pos: any) => {
          const lines = src.split('\n');
          let off = 0;
          for (let i = 0; i < pos.line && i < lines.length; i++) off += lines[i].length + 1;
          return off + pos.character;
        },
        positionAt: (offset: number) => {
          let line = 0, col = 0;
          for (let i = 0; i < offset && i < src.length; i++) {
            if (src[i] === '\n') { line++; col = 0; } else col++;
          }
          return { line, character: col };
        },
      },
      index,
      uri,
      classIndex,
      isModuleMode,
    );

    printCfg(cfg, `${tc.file} — ${tc.description}${isModuleMode ? ' [MODULE MODE]' : ''}`);
  }

  printHeader('DONE');
}

main().catch(e => { console.error(e); process.exit(1); });
