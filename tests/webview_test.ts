import { measure, buildEdgeD, midPoint, ElkEdge } from '../webview/utils';
import { CfgNode } from '../src/cfg/model';

let passed = 0, failed = 0;

function assert(label: string, ok: boolean) {
  if (ok) passed++; else { failed++; console.error(`FAIL: ${label}`); }
}

// measure tests
function test_measure_statement() {
  const n: CfgNode = { id: '1', kind: 'statement', label: 'x = 1' };
  const { w, h } = measure(n);
  assert('statement width', w === 240);
  assert('statement height', h === 40);
}

function test_measure_entry() {
  const n: CfgNode = { id: '2', kind: 'entry', label: 'start' };
  const { w, h } = measure(n);
  assert('entry width', w === 80);
  assert('entry height', h === 40);
}

function test_measure_exit() {
  const n: CfgNode = { id: '3', kind: 'exit', label: 'end' };
  const { w, h } = measure(n);
  assert('exit width', w === 80);
  assert('exit height', h === 40);
}

function test_measure_merge() {
  const n: CfgNode = { id: '4', kind: 'merge', label: '' };
  const { w, h } = measure(n);
  assert('merge height', h === 24);
}

function test_measure_entity() {
  const n: CfgNode = { id: '5', kind: 'entity', label: 'Order\n  id: int\n  total: float' };
  const { w, h } = measure(n);
  assert('entity width', w === 280);
  assert('entity height >= 50', h >= 50);
}

function test_measure_multi_line() {
  const n: CfgNode = { id: '6', kind: 'statement', label: 'long line\nwith\nbreaks' };
  const { w, h } = measure(n);
  assert('multi-line width', w === 240);
  assert('multi-line height (fixed for non-entity)', h === 40);
}

function test_measure_nil_label() {
  const n: CfgNode = { id: '7', kind: 'statement' } as CfgNode;
  const { w, h } = measure(n);
  assert('nil label width', w === 240);
  assert('nil label height', h === 40);
}

// buildEdgeD tests
function test_buildEdgeD_no_bends() {
  const sec: ElkEdge['sections'][0] = { startPoint: { x: 0, y: 0 }, endPoint: { x: 100, y: 50 } };
  const d = buildEdgeD(sec);
  assert('no bends path', d === 'M 0 0 L 100 50');
}

function test_buildEdgeD_with_bends() {
  const sec: ElkEdge['sections'][0] = {
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 100, y: 50 },
    bendPoints: [{ x: 0, y: 50 }, { x: 50, y: 50 }],
  };
  const d = buildEdgeD(sec);
  assert('with bends path', d === 'M 0 0 L 0 50 L 50 50 L 100 50');
}

function test_buildEdgeD_single_bend() {
  const sec: ElkEdge['sections'][0] = {
    startPoint: { x: 10, y: 10 },
    endPoint: { x: 90, y: 90 },
    bendPoints: [{ x: 50, y: 10 }],
  };
  const d = buildEdgeD(sec);
  assert('single bend path', d === 'M 10 10 L 50 10 L 90 90');
}

// midPoint tests
function test_midPoint_no_bends() {
  const sec: ElkEdge['sections'][0] = { startPoint: { x: 0, y: 0 }, endPoint: { x: 100, y: 50 } };
  const pt = midPoint(sec);
  assert('midpoint no bends x', pt.x === 50);
  assert('midpoint no bends y', pt.y === 25);
}

function test_midPoint_with_bends() {
  const sec: ElkEdge['sections'][0] = {
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 100, y: 0 },
    bendPoints: [{ x: 0, y: 50 }, { x: 50, y: 50 }],
  };
  const pt = midPoint(sec);
  assert('midpoint with bends x', pt.x === (50 + 100) / 2);
  assert('midpoint with bends y', pt.y === (50 + 0) / 2);
}

function test_midPoint_single_bend() {
  const sec: ElkEdge['sections'][0] = {
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 100, y: 0 },
    bendPoints: [{ x: 50, y: 0 }],
  };
  const pt = midPoint(sec);
  assert('midpoint single bend', pt.x === (50 + 100) / 2);
  assert('midpoint single bend y', pt.y === 0);
}

// run all
test_measure_statement();
test_measure_entry();
test_measure_exit();
test_measure_merge();
test_measure_entity();
test_measure_multi_line();
test_measure_nil_label();
test_buildEdgeD_no_bends();
test_buildEdgeD_with_bends();
test_buildEdgeD_single_bend();
test_midPoint_no_bends();
test_midPoint_with_bends();
test_midPoint_single_bend();

console.log(`Webview utils: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
