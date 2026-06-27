import Parser from 'web-tree-sitter';
import * as vscode from 'vscode';
import { Cfg, CfgNode, CfgEdge, CfgRegion, SrcRange } from './model';
import * as N from './python-nodes';
import { TextDocLike } from '../parser';
import { resolveCall } from '../resolver';
import { WorkspaceIndex, IndexEntry } from '../indexer';
import { ClassIndex } from '../class-indexer';
import { TypeEnv } from '../type-env';

interface LoopCtx {
  continueTo: string;
  breakTo: string;
}

class Builder {
  nodes: CfgNode[] = [];
  edges: CfgEdge[] = [];
  regions: CfgRegion[] = [];
  private seq = 0;
  private regionSeq = 0;
  private loops: LoopCtx[] = [];
  private exitStack: string[] = [];
  readonly exitId = 'exit';
  private callDepth = 0;
  private currentFileUri?: string;
  typeEnv = new TypeEnv();
  moduleMode = false;
  private regionStack: { id: string; startCount: number }[] = [];

  constructor(
    private doc: TextDocLike,
    private index?: WorkspaceIndex,
    private currentUri?: string,
    private classIndex?: ClassIndex,
  ) {
    this.currentFileUri = currentUri;
    this.add({ id: 'entry', kind: 'entry', label: 'entry' });
    this.add({ id: this.exitId, kind: 'exit', label: 'exit' });
    this.exitStack = [this.exitId];
  }

  private id(): string {
    return `n${this.seq++}`;
  }

  private add(n: CfgNode): string {
    if (this.regionStack.length > 0) {
      n.regionId = this.regionStack[this.regionStack.length - 1].id;
    }
    this.nodes.push(n);
    return n.id;
  }

  private beginRegion(kind: CfgRegion['kind'], headerId: string, exitIds: string[]): void {
    const id = `region_${this.regionSeq++}`;
    this.regions.push({ id, kind, headerId, memberIds: [], exitIds });
    this.regionStack.push({ id, startCount: this.nodes.length });
  }

  private endRegion(): void {
    const entry = this.regionStack.pop()!;
    const r = this.regions.find(r => r.id === entry.id)!;
    r.memberIds = this.nodes.slice(entry.startCount).map(n => n.id);
  }

  link(from: string[], to: string, kind: CfgEdge['kind'] = 'normal', label?: string): void {
    for (const f of from) {
      this.edges.push({ from: f, to, kind, label });
    }
  }

  block(block: Parser.SyntaxNode, preds: string[]): string[] {
    let frontier = preds;
    for (const stmt of block.namedChildren) {
      if (isDocstring(stmt)) continue;
      frontier = this.statement(stmt, frontier);
      if (frontier.length === 0) break;
    }
    return frontier;
  }

  statement(node: Parser.SyntaxNode, preds: string[]): string[] {
    switch (node.type) {
      case N.IF:        return this.ifStmt(node, preds);
      case N.FOR:       return this.forStmt(node, preds);
      case N.WHILE:     return this.whileStmt(node, preds);
      case N.RETURN:    return this.terminator(node, preds, 'return');
      case N.RAISE:     return this.terminator(node, preds, 'raise');
      case N.BREAK:     this.link(preds, this.loops.at(-1)!.breakTo); return [];
      case N.CONTINUE:  this.link(preds, this.loops.at(-1)!.continueTo); return [];
      case N.TRY:       return this.tryStmt(node, preds);
      case N.WITH:      return this.block(node.childForFieldName('body')!, preds);
      case N.MATCH:     return this.matchStmt(node, preds);
      case N.FUNCTION_DEF:
        return this.addDrillable(node, preds);
      case N.IMPORT:
      case N.IMPORT_FROM:
        return preds;
      case N.ASYNC_FUNC:
        if (this.moduleMode) return this.addDrillable(node, preds);
        return this.block(node.childForFieldName('body')!, preds);
      case N.ASYNC_FOR:   return this.forStmt(node, preds);
      case N.ASYNC_WITH:  return this.block(node.childForFieldName('body')!, preds);
      case N.CLASS_DEF: {
        if (this.moduleMode) return this.addDrillable(node, preds);
        this.typeEnv.push();
        const clsName = node.childForFieldName('name')?.text;
        if (clsName) this.typeEnv.set('self', clsName);
        const r = this.block(node.childForFieldName('body')!, preds);
        this.typeEnv.pop();
        return r;
      }
      case N.DECORATED_DEF: {
        const inner = node.namedChildren[node.namedChildren.length - 1];
        if (inner) return this.statement(inner, preds);
        return this.defaultStmt(node, preds);
      }
      default:          return this.defaultStmt(node, preds);
    }
  }

  private addDrillable(node: Parser.SyntaxNode, preds: string[]): string[] {
    const id = this.add({
      id: this.id(), kind: 'statement',
      label: this.text(node),
      detail: node.text,
      range: withUri(this.range(node), this.currentFileUri),
      drillable: true,
    });
    this.link(preds, id);
    return [id];
  }

  private defaultStmt(node: Parser.SyntaxNode, preds: string[]): string[] {
    this.typeEnv.trackAssignment(node);

    if (this.index && this.callDepth < 2) {
      const callNode = findCallExpression(node);
      if (callNode) {
        const resolved = resolveCall(
          callNode,
          this.currentUri ? uriFromString(this.currentUri) : undefined,
          this.index,
          this.classIndex,
          this.typeEnv,
        );
        if (resolved && resolved.entry.uri.fsPath !== this.currentFileUri) {
          return this.inlineCall(node, resolved.entry, preds);
        }
      }
    }

    const hasCall = findCallExpression(node) !== null;
    let label = this.text(node);
    if (hasCall) {
      const callNode = findCallExpression(node);
      if (callNode) label = this.text(callNode);
    }
    const id = this.add({
      id: this.id(), kind: hasCall ? 'call' : 'statement',
      label,
      detail: node.text,
      range: withUri(this.range(node), this.currentFileUri),
      drillable: hasCall,
    });
    this.link(preds, id);
    return [id];
  }

  private inlineCall(stmtNode: Parser.SyntaxNode, resolved: IndexEntry, preds: string[]): string[] {
    this.callDepth++;
    this.typeEnv.push();

    const oldFileUri = this.currentFileUri;

    const callId = this.add({
      id: this.id(), kind: 'call',
      label: `call ${resolved.name}`,
      detail: stmtNode.text,
      range: withUri(this.range(stmtNode), oldFileUri),
    });
    this.link(preds, callId);

    const fn = resolved.node;
    // Set self → class name for label replacement inside method bodies
    if (fn.type === 'class_definition') {
      const cn = fn.childForFieldName('name')?.text;
      if (cn) this.typeEnv.set('self', cn);
    } else {
      let p = fn.parent;
      while (p) {
        if (p.type === 'class_definition') {
          const cn = p.childForFieldName('name')?.text;
          if (cn) this.typeEnv.set('self', cn);
          break;
        }
        p = p.parent;
      }
    }

    // For constructor calls (class_definition), use __init__ body instead of full class body
    let body = fn.childForFieldName('body');
    if (fn.type === 'class_definition') {
      const initMethod = findInitMethod(fn);
      if (initMethod) {
        body = initMethod.childForFieldName('body');
      }
    }
    if (!body) { this.typeEnv.pop(); this.callDepth--; return [callId]; }

    const calleeExitId = `inline_exit_${this.seq++}`;
    this.add({ id: calleeExitId, kind: 'merge', label: '' });

    this.exitStack.push(calleeExitId);

    const oldDoc = this.doc;
    this.doc = {
      getText: () => resolved.source,
      offsetAt: (pos) => {
        const lines = resolved.source.split('\n');
        let offset = 0;
        for (let i = 0; i < pos.line && i < lines.length; i++) {
          offset += lines[i].length + 1;
        }
        return offset + pos.character;
      },
      positionAt: (offset) => {
        const text = resolved.source;
        let line = 0, col = 0;
        for (let i = 0; i < offset && i < text.length; i++) {
          if (text[i] === '\n') { line++; col = 0; }
          else col++;
        }
        return { line, character: col };
      },
    };
    this.currentFileUri = resolved.uri.toString();

    const calleeFrontier = this.block(body, [callId]);

    this.doc = oldDoc;
    this.currentFileUri = oldFileUri;
    this.exitStack.pop();
    this.typeEnv.pop();

    this.link(calleeFrontier, calleeExitId);

    this.callDepth--;
    return [calleeExitId];
  }

  private ifStmt(node: Parser.SyntaxNode, preds: string[]): string[] {
    const condId = this.add({
      id: this.id(), kind: 'branch',
      label: this.text(node.childForFieldName('condition')!),
      detail: node.text,
      range: withUri(this.range(node), this.currentFileUri),
    });
    this.link(preds, condId);

    this.beginRegion('if', condId, []);

    const consequence = node.childForFieldName('consequence')!;
    const trueFrontier = this.block(consequence, [condId]);
    for (const e of this.edges) {
      if (e.from === condId && e.kind === 'normal') e.kind = 'true';
    }

    let falsePreds: string[] = [condId];
    let elseFrontier: string[] = [];
    let sawElse = false;

    for (const alt of node.childrenForFieldName('alternative')) {
      if (alt.type === N.ELIF) {
        const cId = this.add({
          id: this.id(), kind: 'branch',
          label: this.text(alt.childForFieldName('condition')!),
          detail: alt.text,
          range: withUri(this.range(alt), this.currentFileUri),
        });
        this.link(falsePreds, cId, 'false');
        const elifFrontier = this.block(alt.childForFieldName('consequence')!, [cId]);
        for (const e of this.edges) {
          if (e.from === cId && e.kind === 'normal') e.kind = 'true';
        }
        elseFrontier.push(...elifFrontier);
        falsePreds = [cId];
      } else if (alt.type === N.ELSE) {
        sawElse = true;
        elseFrontier.push(...this.block(alt.childForFieldName('body')!, falsePreds));
      }
    }

    const falseExit = sawElse ? elseFrontier : [...falsePreds, ...elseFrontier];
    const result = [...trueFrontier, ...falseExit];
    this.regions[this.regions.length - 1].exitIds = result;
    this.endRegion();
    return result;
  }

  private forStmt(node: Parser.SyntaxNode, preds: string[]): string[] {
    const left = node.childForFieldName('left');
    const right = node.childForFieldName('right');
    const isAsync = node.text.startsWith('async');
    const prefix = isAsync ? 'async for' : 'for';
    const headerId = this.add({
      id: this.id(), kind: 'loop',
      label: `${prefix} ${this.text(left)} in ${this.text(right)}`,
      detail: node.text,
      range: withUri(this.range(node), this.currentFileUri),
    });
    this.link(preds, headerId);

    const afterId = this.add({ id: this.id(), kind: 'merge', label: '' });
    this.loops.push({ continueTo: headerId, breakTo: afterId });

    this.beginRegion('for', headerId, [afterId]);

    const body = node.childForFieldName('body')!;
    const bodyFrontier = this.block(body, [headerId]);
    for (const e of this.edges) {
      if (e.from === headerId && e.kind === 'normal') e.kind = 'true';
    }
    this.link(bodyFrontier, headerId, 'loop-back');
    this.loops.pop();

    const elseClause = node.childForFieldName('alternative');
    if (elseClause) {
      const elseFrontier = this.block(elseClause.childForFieldName('body')!, [headerId]);
      this.edges.filter(e => e.from === headerId && elseFrontier.includes(e.to)).forEach(e => (e.kind = 'false'));
      this.link(elseFrontier, afterId);
    } else {
      this.link([headerId], afterId, 'false');
    }
    this.endRegion();
    return [afterId];
  }

  private whileStmt(node: Parser.SyntaxNode, preds: string[]): string[] {
    const condition = node.childForFieldName('condition');
    const headerId = this.add({
      id: this.id(), kind: 'loop',
      label: `while ${this.text(condition)}`,
      detail: node.text,
      range: withUri(this.range(node), this.currentFileUri),
    });
    this.link(preds, headerId);
    const afterId = this.add({ id: this.id(), kind: 'merge', label: '' });
    this.loops.push({ continueTo: headerId, breakTo: afterId });

    this.beginRegion('while', headerId, [afterId]);

    const body = node.childForFieldName('body')!;
    const bodyFrontier = this.block(body, [headerId]);
    for (const e of this.edges) {
      if (e.from === headerId && e.kind === 'normal') e.kind = 'true';
    }
    this.link(bodyFrontier, headerId, 'loop-back');
    this.loops.pop();
    const elseClause = node.childForFieldName('alternative');
    if (elseClause) {
      const elseFrontier = this.block(elseClause.childForFieldName('body')!, [headerId]);
      this.edges.filter(e => e.from === headerId && elseFrontier.includes(e.to)).forEach(e => (e.kind = 'false'));
      this.link(elseFrontier, afterId);
    } else {
      this.link([headerId], afterId, 'false');
    }
    this.endRegion();
    return [afterId];
  }

  private terminator(node: Parser.SyntaxNode, preds: string[], kind: 'return' | 'raise'): string[] {
    const id = this.add({
      id: this.id(), kind,
      label: this.text(node),
      detail: node.text,
      range: withUri(this.range(node), this.currentFileUri),
    });
    this.link(preds, id);
    this.link([id], this.exitStack[this.exitStack.length - 1] ?? this.exitId);
    return [];
  }

  private tryStmt(node: Parser.SyntaxNode, preds: string[]): string[] {
    const body = node.childForFieldName('body')!;
    const finallyClause = node.namedChildren.find(n => n.type === 'finally_clause');

    let finallyEntryId: string | undefined;
    if (finallyClause) {
      finallyEntryId = this.id();
      this.add({ id: finallyEntryId, kind: 'merge', label: '' });
      this.exitStack.push(finallyEntryId);
    }

    const bodyNodeCount = this.nodes.length;
    const bodyFrontier = this.block(body, preds);
    const handlerFrontiers: string[] = [];
    const bodyNodeIds = this.nodes.slice(bodyNodeCount).map(n => n.id);
    for (const ex of node.namedChildren.filter(n => n.type === N.EXCEPT_HANDLER)) {
      const excType = ex.namedChildren.find((c: Parser.SyntaxNode) => c.type !== 'block');
      const excLabel = excType ? this.text(excType) : '';
      const hId = this.add({
        id: this.id(), kind: 'statement',
        label: excLabel || 'except',
        detail: ex.text,
        range: withUri(this.range(ex), this.currentFileUri),
      });
      const sources = bodyFrontier.length > 0 ? bodyFrontier : bodyNodeIds;
      this.link(sources, hId, 'exception', excLabel || 'exception');
      const handlerBody = ex.namedChildren.find((c: Parser.SyntaxNode) => c.type === 'block') ?? ex;
      handlerFrontiers.push(...this.block(handlerBody, [hId]));
    }

    if (finallyClause && finallyEntryId) {
      this.exitStack.pop();
      const finallyBody = finallyClause.childForFieldName('body') ?? finallyClause;
      const finalPreds = bodyFrontier.length ? bodyFrontier : [];
      const allPreds = [...finalPreds, ...handlerFrontiers];
      const hasAbnormal = this.edges.some(e => e.to === finallyEntryId);
      if (hasAbnormal) {
        allPreds.push(finallyEntryId);
      } else {
        this.nodes = this.nodes.filter(n => n.id !== finallyEntryId);
      }
      return this.block(finallyBody, allPreds);
    }
    return [...bodyFrontier, ...handlerFrontiers];
  }

  private matchStmt(node: Parser.SyntaxNode, preds: string[]): string[] {
    const subject = node.childForFieldName('subject');
    const subjId = this.add({
      id: this.id(), kind: 'branch',
      label: `match ${this.text(subject)}`,
      detail: node.text,
      range: withUri(this.range(node), this.currentFileUri),
    });
    this.link(preds, subjId);
    this.beginRegion('match', subjId, []);
    const out: string[] = [];
    const bodyBlock = node.namedChildren.find(n => n.type === 'block');
    if (bodyBlock) {
      for (const c of bodyBlock.namedChildren.filter(n => n.type === N.CASE)) {
        const caseBody = c.namedChildren.find((n: Parser.SyntaxNode) => n.type === 'block');
        const beforeCount = this.edges.length;
        const caseFrontier = caseBody ? this.block(caseBody, [subjId]) : this.block(c, [subjId]);
        for (let i = beforeCount; i < this.edges.length; i++) {
          if (this.edges[i].from === subjId && this.edges[i].kind === 'normal') {
            this.edges[i].kind = 'case';
          }
        }
        out.push(...caseFrontier);
      }
    }
    this.regions[this.regions.length - 1].exitIds = out;
    this.endRegion();
    return out;
  }

  private text(n: Parser.SyntaxNode | null): string {
    if (!n) return '';

    // Function definitions: compact form, strip `self` from instance methods
    if (n.type === 'function_definition' || n.type === 'async_function_definition') {
      const prefix = n.type === 'async_function_definition' ? 'async def' : 'def';
      const name = n.childForFieldName('name')?.text ?? '';
      const params = n.childForFieldName('parameters')?.text ?? '()';
      const cleanParams = params.replace(/^\(self\s*,\s*/, '(').replace(/^\(self\)/, '()');
      const retType = n.childForFieldName('return_type');
      const ret = retType ? ` -> ${retType.text}` : '';
      return `${prefix} ${name}${cleanParams}${ret}`;
    }

    const t = n.text;
    const firstLine = t.split('\n')[0].trimEnd();

    // Multi-line statement — first line ends with opening bracket or comma
    if (t.includes('\n')) {
      const stripped = firstLine.replace(/[({\[,]\s*$/, '').trimEnd();
      let label = stripped ? stripped + '(...)' : firstLine;
      const clsName = this.typeEnv.get('self');
      if (clsName) label = label.replace(/\bself\./g, clsName + '.');
      return label;
    }

    // Single line — truncate if too long
    let label = firstLine.length > 100 ? firstLine.slice(0, 97) + '...' : firstLine;

    // Replace self. with the class name when inside a class method
    const clsName = this.typeEnv.get('self');
    if (clsName) label = label.replace(/\bself\./g, clsName + '.');

    return label;
  }

  private range(n: Parser.SyntaxNode): SrcRange {
    return { startLine: n.startPosition.row, startCol: n.startPosition.column, endLine: n.endPosition.row, endCol: n.endPosition.column };
  }
}

function findCallExpression(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  if (node.type === 'call') return node;
  for (const child of node.namedChildren) {
    const found = findCallExpression(child);
    if (found) return found;
  }
  return null;
}

function isDocstring(node: Parser.SyntaxNode): boolean {
  if (node.type !== 'expression_statement') return false;
  const expr = node.firstNamedChild;
  return expr?.type === 'string';
}

function withUri(range: SrcRange, uri?: string): SrcRange {
  return uri ? { ...range, uri } : range;
}

function uriFromString(s: string): vscode.Uri {
  return vscode.Uri.parse(s);
}

function findInitMethod(cls: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const body = cls.childForFieldName('body');
  if (!body) return null;
  for (const stmt of body.namedChildren) {
    if (stmt.type === 'function_definition' && stmt.childForFieldName('name')?.text === '__init__') {
      return stmt;
    }
    if (stmt.type === 'decorated_definition') {
      const inner = stmt.namedChildren[stmt.namedChildren.length - 1];
      if (inner?.type === 'function_definition' && inner.childForFieldName('name')?.text === '__init__') {
        return inner;
      }
    }
  }
  return null;
}

export function buildCfg(
  fn: Parser.SyntaxNode,
  doc: TextDocLike,
  index?: WorkspaceIndex,
  currentUri?: string,
  classIndex?: ClassIndex,
  moduleMode = false,
): Cfg {
  const b = new Builder(doc, index, currentUri, classIndex);
  b.moduleMode = moduleMode;
  // Set self → class name if function is inside a class
  let p: Parser.SyntaxNode | null = fn.parent;
  while (p) {
    if (p.type === 'class_definition') {
      const cn = p.childForFieldName('name')?.text;
      if (cn) b.typeEnv.set('self', cn);
      break;
    }
    p = p.parent;
  }
  const body = fn.childForFieldName('body') ?? fn;
  const frontier = b.block(body, ['entry']);
  b.link(frontier, b.exitId);
  return { nodes: b.nodes, edges: b.edges, regions: b.regions, entryId: 'entry', exitId: b.exitId, layout: 'cfg' };
}
