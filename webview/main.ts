import ELK from 'elkjs/lib/elk.bundled.js';
import { Cfg, CfgNode, CfgEdge } from '../src/cfg/model';

declare const __CFG__: Cfg;
const vscode = acquireVsCodeApi();

const SHAPES = {
  entry:     { fill: '#1b5e20', stroke: '#4caf50', icon: '▶', shape: 'oval' },
  exit:      { fill: '#b71c1c', stroke: '#f44336', icon: '■', shape: 'oval' },
  statement: { fill: '#0d47a1', stroke: '#42a5f5', icon: '', shape: 'rect' },
  branch:    { fill: '#e65100', stroke: '#ff9800', icon: '◇', shape: 'diamond' },
  loop:      { fill: '#4a148c', stroke: '#ab47bc', icon: '↻', shape: 'hexagon' },
  merge:     { fill: '#37474f', stroke: '#78909c', icon: '', shape: 'circle' },
  return:    { fill: '#b71c1c', stroke: '#ef5350', icon: '⇦', shape: 'rect' },
  raise:     { fill: '#880e4f', stroke: '#ec407a', icon: '⚠', shape: 'rect' },
};

const EDGE_STYLES: Record<string, { color: string; dash: string }> = {
  normal:     { color: '#78909c', dash: '' },
  true:       { color: '#4caf50', dash: '' },
  false:      { color: '#ef5350', dash: '' },
  'loop-back': { color: '#ab47bc', dash: '6,4' },
  exception:  { color: '#ff7043', dash: '8,4' },
  case:       { color: '#42a5f5', dash: '' },
};

const LABEL: Record<string, string> = {
  true: 'Yes', false: 'No', 'loop-back': 'Loop', exception: 'Error', case: 'Case',
};

interface ElkNode { id: string; width: number; height: number; x?: number; y?: number }
interface ElkEdge { id: string; sources: string[]; targets: string[]; sections?: Array<{ startPoint: {x:number,y:number}; endPoint: {x:number,y:number}; bendPoints?: Array<{x:number,y:number}> }> }

function diamondPoints(cx: number, cy: number, w: number, h: number): string {
  return `${cx+w/2},${cy} ${cx+w},${cy+h/2} ${cx+w/2},${cy+h} ${cx},${cy+h/2}`;
}

function hexagonPoints(cx: number, cy: number, w: number, h: number): string {
  const hw = w / 2, hh = h / 2, qw = w / 6;
  return `${cx+qw},${cy} ${cx+w-qw},${cy} ${cx+w},${cy+hh} ${cx+w-qw},${cy+h} ${cx+qw},${cy+h} ${cx},${cy+hh}`;
}

function ovalPath(cx: number, cy: number, w: number, h: number): string {
  const rx = w / 2, ry = h / 2;
  return `M ${cx+rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx+rx} ${cy+h} A ${rx} ${ry} 0 0 1 ${cx+rx} ${cy} Z`;
}

function truncate(s: string, max: number): string {
  return s ? (s.length > max ? s.slice(0, max-1) + '\u2026' : s) : '';
}

function measure(n: CfgNode): { w: number; h: number } {
  const s = n.label?.split('\n')[0] ?? '';
  const maxW = n.kind === 'entry' || n.kind === 'exit' ? 80 : 200;
  return { w: maxW, h: n.kind === 'merge' ? 24 : 40 };
}

function buildEdgeD(sec: ElkEdge['sections'][0]): string {
  let d = `M ${sec.startPoint.x} ${sec.startPoint.y}`;
  if (sec.bendPoints?.length) {
    for (const bp of sec.bendPoints) d += ` L ${bp.x} ${bp.y}`;
  }
  d += ` L ${sec.endPoint.x} ${sec.endPoint.y}`;
  return d;
}

function midPoint(sec: ElkEdge['sections'][0]): { x: number; y: number } {
  if (sec.bendPoints?.length) {
    const bp = sec.bendPoints;
    const last = bp[bp.length - 1];
    return { x: (last.x + sec.endPoint.x) / 2, y: (last.y + sec.endPoint.y) / 2 };
  }
  return { x: (sec.startPoint.x + sec.endPoint.x) / 2, y: (sec.startPoint.y + sec.endPoint.y) / 2 };
}

const collapsedRegions = new Set<string>();
let zoom = 1, panX = 0, panY = 0;
let tooltipEl: HTMLDivElement | null = null;

async function render(cfg: Cfg) {
  const elk = new ELK();
  const root = document.getElementById('root')!;
  root.innerHTML = `
    <div class="canvas" id="canvas">
      <div class="toolbar" id="toolbar">
        <button class="tb-btn" id="zoom-in" title="Zoom In">+</button>
        <span class="zoom-lvl" id="zoom-lvl">100%</span>
        <button class="tb-btn" id="zoom-out" title="Zoom Out">−</button>
        <button class="tb-btn" id="fit" title="Fit to View">⊡</button>
      </div>
      <div class="tooltip" id="tooltip"></div>
      <svg id="svg" width="100%" height="100%"></svg>
    </div>
  `;

  const svg = document.getElementById('svg') as unknown as SVGSVGElement;
  const canvas = document.getElementById('canvas')!;
  const tooltip = document.getElementById('tooltip') as HTMLDivElement;
  tooltipEl = tooltip;

  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = `
    <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.35"/></filter>
    <filter id="shadow-sm"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.25"/></filter>
    <marker id="arr-gray" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#78909c"/></marker>
    <marker id="arr-green" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#4caf50"/></marker>
    <marker id="arr-red" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ef5350"/></marker>
    <marker id="arr-purple" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ab47bc"/></marker>
    <marker id="arr-orange" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ff7043"/></marker>
  `;
  svg.appendChild(defs);

  const mainG = document.createElementNS(ns, 'g');
  svg.appendChild(mainG);

  const edgesG = document.createElementNS(ns, 'g');
  const nodesG = document.createElementNS(ns, 'g');
  mainG.appendChild(edgesG);
  mainG.appendChild(nodesG);

  try {
    const { nodes: active, edges: raw } = filterActive(cfg);
    const egs = reroute(cfg, raw);

    const elkGraph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.layered.spacing.nodeNodeBetweenLayers': '48',
        'elk.spacing.nodeNode': '32',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      },
      children: active.map(n => { const {w,h} = measure(n); return {id:n.id,width:w,height:h}; }),
      edges: egs.map((_,i) => ({id:`e${i}`,sources:[_.from],targets:[_.to]})),
    };

    const layout = await elk.layout(elkGraph);
    const cMap = new Map(active.map(n => [n.id, n]));
    const eMap = new Map(egs.map((e,i) => [`e${i}`, e]));
    const lc = (layout.children ?? []) as ElkNode[];
    const le = (layout.edges ?? []) as ElkEdge[];

    let gW = 400, gH = 300;
    for (const c of lc) { if (c.x && c.y) { gW = Math.max(gW, c.x+(c.width??200)+100); gH = Math.max(gH, c.y+(c.height??40)+100); } }

    svg.setAttribute('viewBox', `0 0 ${gW} ${gH}`);

    for (const e of le) {
      if (!e.sections?.length) continue;
      const info = eMap.get(e.id);
      const st = EDGE_STYLES[info?.kind ?? 'normal'] ?? EDGE_STYLES.normal;
      const mid = (k: string) => k === 'true' ? 'green' : k === 'false' ? 'red' : k === 'loop-back' ? 'purple' : k === 'exception' ? 'orange' : 'gray';

      for (const sec of e.sections) {
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', buildEdgeD(sec));
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', st.color);
        p.setAttribute('stroke-width', '2');
        p.setAttribute('stroke-linejoin', 'round');
        p.setAttribute('marker-end', `url(#arr-${mid(info?.kind ?? '')})`);
        if (st.dash) p.setAttribute('stroke-dasharray', st.dash);
        p.classList.add('edge');
        edgesG.appendChild(p);
      }

      const lbl = LABEL[info?.kind ?? ''] ?? '';
      if (lbl) {
        const mp = midPoint(e.sections[e.sections.length-1]);
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', String(mp.x));
        t.setAttribute('y', String(mp.y - 6));
        t.setAttribute('fill', st.color);
        t.setAttribute('font-size', '11');
        t.setAttribute('font-weight', '600');
        t.setAttribute('text-anchor', 'middle');
        t.textContent = lbl;
        t.classList.add('edge-label');
        edgesG.appendChild(t);
      }
    }

    for (const c of lc) {
      if (!c.x || !c.y) continue;
      const node = cMap.get(c.id);
      if (!node) continue;
      const st = SHAPES[node.kind] ?? SHAPES.statement;
      const cw = c.width ?? 200, ch = c.height ?? 40;
      const cx = c.x, cy = c.y;

      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'node-group');
      g.dataset.id = node.id;

      if (st.shape === 'oval') {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', ovalPath(cx, cy, cw, ch));
        path.setAttribute('fill', st.fill);
        path.setAttribute('stroke', st.stroke);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('filter', 'url(#shadow)');
        path.classList.add('node-shape');
        g.appendChild(path);
      } else if (st.shape === 'diamond') {
        const poly = document.createElementNS(ns, 'polygon');
        poly.setAttribute('points', diamondPoints(cx, cy+ch/2, cw, ch));
        poly.setAttribute('fill', st.fill);
        poly.setAttribute('stroke', st.stroke);
        poly.setAttribute('stroke-width', '2');
        poly.setAttribute('filter', 'url(#shadow)');
        poly.classList.add('node-shape');
        g.appendChild(poly);
      } else if (st.shape === 'hexagon') {
        const poly = document.createElementNS(ns, 'polygon');
        poly.setAttribute('points', hexagonPoints(cx, cy+ch/2, cw, ch));
        poly.setAttribute('fill', st.fill);
        poly.setAttribute('stroke', st.stroke);
        poly.setAttribute('stroke-width', '2');
        poly.setAttribute('filter', 'url(#shadow)');
        poly.classList.add('node-shape');
        g.appendChild(poly);
      } else if (st.shape === 'circle') {
        const r = Math.min(cw, ch) / 2;
        const circ = document.createElementNS(ns, 'circle');
        circ.setAttribute('cx', String(cx + cw/2));
        circ.setAttribute('cy', String(cy + ch/2));
        circ.setAttribute('r', String(r));
        circ.setAttribute('fill', st.fill);
        circ.setAttribute('stroke', st.stroke);
        circ.setAttribute('stroke-width', '2');
        circ.setAttribute('filter', 'url(#shadow-sm)');
        circ.classList.add('node-shape');
        g.appendChild(circ);
      } else {
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(cx));
        rect.setAttribute('y', String(cy));
        rect.setAttribute('width', String(cw));
        rect.setAttribute('height', String(ch));
        rect.setAttribute('rx', '6');
        rect.setAttribute('ry', '6');
        rect.setAttribute('fill', st.fill);
        rect.setAttribute('stroke', st.stroke);
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('filter', 'url(#shadow)');
        rect.classList.add('node-shape');
        g.appendChild(rect);
      }

      const tx = st.shape === 'diamond' ? cx + cw/2 : cx + 10;
      const ty = st.shape === 'diamond' ? cy + ch/2 + 5 : cy + 26;
      const ta = st.shape === 'diamond' ? 'middle' : 'start';

      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', String(tx));
      txt.setAttribute('y', String(ty));
      txt.setAttribute('fill', '#fff');
      txt.setAttribute('font-size', st.shape === 'diamond' ? '11' : '12');
      txt.setAttribute('font-weight', '500');
      txt.setAttribute('text-anchor', ta);
      txt.setAttribute('font-family', 'var(--vscode-editor-font-family, monospace)');
      txt.textContent = truncate(node.label?.split('\n')[0] ?? '', st.shape === 'diamond' ? 12 : 24);
      g.appendChild(txt);

      if (node.range) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => vscode.postMessage({ type: 'reveal', range: node.range }));
        g.addEventListener('mouseenter', (e) => showTooltip(e, node));
        g.addEventListener('mousemove', (e) => moveTooltip(e));
        g.addEventListener('mouseleave', hideTooltip);
      }

      nodesG.appendChild(g);
    }

    setupInteraction(canvas, svg, mainG, gW, gH);
  } catch (err) {
    root.innerHTML = `<div class="error">Failed to render: ${err}</div>`;
  }
}

function showTooltip(e: MouseEvent, node: CfgNode) {
  if (!tooltipEl) return;
  const s = SHAPES[node.kind] ?? SHAPES.statement;
  tooltipEl.innerHTML = `
    <div class="tt-header" style="color:${s.stroke}">${node.kind.toUpperCase()}</div>
    <div class="tt-body">${truncate(node.label ?? '', 120)}</div>
    ${node.range ? `<div class="tt-src">Line ${node.range.startLine + 1}</div>` : ''}
  `;
  tooltipEl.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e: MouseEvent) {
  if (!tooltipEl) return;
  const pad = 12;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = tooltipEl.getBoundingClientRect();
  if (x + r.width > window.innerWidth - pad) x = e.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - pad) y = e.clientY - r.height - pad;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

function setupInteraction(canvas: HTMLElement, svg: SVGSVGElement, mainG: SVGGElement, gW: number, gH: number) {
  let dragging = false, lastX = 0, lastY = 0;
  const zoomIn = document.getElementById('zoom-in')!;
  const zoomOut = document.getElementById('zoom-out')!;
  const zoomLvl = document.getElementById('zoom-lvl')!;
  const fit = document.getElementById('fit')!;

  function applyTransform() {
    mainG.setAttribute('transform', `translate(${panX},${panY}) scale(${zoom})`);
    zoomLvl.textContent = Math.round(zoom * 100) + '%';
  }

  canvas.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.tb-btn, .toolbar')) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panX += (e.clientX - lastX);
    panY += (e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZ = Math.max(0.1, Math.min(5, zoom * delta));
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    panX = mx - (mx - panX) * (newZ / zoom);
    panY = my - (my - panY) * (newZ / zoom);
    zoom = newZ;
    applyTransform();
  }, { passive: false });

  zoomIn.addEventListener('click', () => {
    zoom = Math.min(5, zoom * 1.3);
    applyTransform();
  });

  zoomOut.addEventListener('click', () => {
    zoom = Math.max(0.1, zoom / 1.3);
    applyTransform();
  });

  fit.addEventListener('click', () => {
    zoom = 1; panX = 0; panY = 0;
    applyTransform();
  });

  applyTransform();
}

function filterActive(cfg: Cfg) {
  const hidden = new Set<string>();
  for (const r of cfg.regions) {
    if (collapsedRegions.has(r.id)) for (const m of r.memberIds) hidden.add(m);
  }
  const nodes = cfg.nodes.filter(n => !hidden.has(n.id));
  const ids = new Set(nodes.map(n => n.id));
  return { nodes, edges: cfg.edges.filter(e => ids.has(e.from) && ids.has(e.to)) };
}

function reroute(cfg: Cfg, edges: CfgEdge[]) {
  const header = new Map<string, string>();
  for (const r of cfg.regions) {
    if (collapsedRegions.has(r.id)) for (const m of r.memberIds) header.set(m, r.headerId);
  }
  return edges.map(e => ({ ...e, from: header.get(e.from) ?? e.from, to: header.get(e.to) ?? e.to }));
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof __CFG__ !== 'undefined') render(__CFG__);
});
