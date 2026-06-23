import ELK from 'elkjs/lib/elk.bundled.js';
import { Cfg, CfgNode, CfgEdge } from '../src/cfg/model';

declare const __CFG__: Cfg;

const vscode = acquireVsCodeApi();

interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: ElkEdge[];
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: Array<{ startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: Array<{ x: number; y: number }> }>;
}

let collapsedRegions = new Set<string>();

const KIND_COLORS: Record<string, string> = {
  entry: '#2e7d32',
  exit: '#c62828',
  statement: '#1565c0',
  branch: '#e65100',
  loop: '#6a1b9a',
  merge: '#555',
  return: '#c62828',
  raise: '#c62828',
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;

function measure(n: CfgNode): { w: number; h: number } {
  const lines = Math.max(1, Math.ceil((n.label?.length ?? 10) / 20));
  return { w: NODE_WIDTH, h: Math.max(NODE_HEIGHT, lines * 20 + 16) };
}

function filterActiveNodes(cfg: Cfg): { nodes: CfgNode[]; edges: CfgEdge[] } {
  const hiddenIds = new Set<string>();
  for (const region of cfg.regions) {
    if (collapsedRegions.has(region.id)) {
      for (const mid of region.memberIds) hiddenIds.add(mid);
    }
  }

  const activeNodes = cfg.nodes.filter(n => !hiddenIds.has(n.id));
  const activeNodeIds = new Set(activeNodes.map(n => n.id));

  const activeEdges = cfg.edges.filter(e => {
    if (!activeNodeIds.has(e.from) || !activeNodeIds.has(e.to)) return false;
    return true;
  });

  return { nodes: activeNodes, edges: activeEdges };
}

function applyCollapseReroutes(cfg: Cfg, activeEdges: CfgEdge[]): CfgEdge[] {
  const rerouted: CfgEdge[] = [];
  const headerOf = new Map<string, string>();
  for (const region of cfg.regions) {
    if (collapsedRegions.has(region.id)) {
      for (const mid of region.memberIds) {
        headerOf.set(mid, region.headerId);
      }
    }
  }

  for (const e of activeEdges) {
    const from = headerOf.get(e.from) ?? e.from;
    const to = headerOf.get(e.to) ?? e.to;
    if (from !== to) {
      rerouted.push({ ...e, from, to });
    }
  }
  return rerouted;
}

async function render(cfg: Cfg) {
  const elk = new ELK();
  const root = document.getElementById('root')!;
  root.innerHTML = '<div class="loading">Loading control-flow graph...</div>';

  try {
    const { nodes: activeNodes, edges: rawEdges } = filterActiveNodes(cfg);
    const activeEdges = applyCollapseReroutes(cfg, rawEdges);

    const elkGraph: ElkNode = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.layered.spacing.nodeNodeBetweenLayers': '48',
        'elk.spacing.nodeNode': '32',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      },
      children: activeNodes.map(n => {
        const { w, h } = measure(n);
        return { id: n.id, width: w, height: h };
      }),
      edges: activeEdges.map((e, i) => ({
        id: `e${i}`,
        sources: [e.from],
        targets: [e.to],
      })),
    };

    const layout = await elk.layout(elkGraph);

    root.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.minHeight = '400px';
    svg.setAttribute('viewBox', '0 0 1200 800');

    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const elkEdges = (layout.edges ?? []) as ElkEdge[];
    const elkChildren = (layout.children ?? []) as ElkNode[];

    for (const edge of elkEdges) {
      if (!edge.sections) continue;
      for (const section of edge.sections) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = `M ${section.startPoint.x} ${section.startPoint.y}`;
        if (section.bendPoints && section.bendPoints.length > 0) {
          const bp = section.bendPoints;
          if (bp.length === 1) {
            d += ` Q ${bp[0].x} ${bp[0].y}, ${section.endPoint.x} ${section.endPoint.y}`;
          } else {
            for (let i = 0; i < bp.length; i++) {
              d += ` L ${bp[i].x} ${bp[i].y}`;
            }
            d += ` L ${section.endPoint.x} ${section.endPoint.y}`;
          }
        } else {
          d += ` L ${section.endPoint.x} ${section.endPoint.y}`;
        }
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#888');
        path.setAttribute('stroke-width', '2');
        edgesGroup.appendChild(path);
      }
    }

    const nodeMap = new Map(activeNodes.map(n => [n.id, n]));
    for (const child of elkChildren) {
      if (!child.x || !child.y) continue;
      const node = nodeMap.get(child.id);
      if (!node) continue;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${child.x}, ${child.y})`);
      g.style.cursor = node.kind === 'entry' || node.kind === 'exit' ? 'default' : 'pointer';

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', String(child.width));
      rect.setAttribute('height', String(child.height));
      rect.setAttribute('rx', '6');
      rect.setAttribute('ry', '6');
      rect.setAttribute('fill', KIND_COLORS[node.kind] ?? '#555');
      rect.setAttribute('opacity', '0.9');
      g.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '8');
      text.setAttribute('y', '28');
      text.setAttribute('fill', '#fff');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-family', 'var(--vscode-editor-font-family, monospace)');
      text.textContent = node.label?.slice(0, 40) ?? '';
      g.appendChild(text);

      g.addEventListener('click', () => {
        if (node.range) {
          vscode.postMessage({ type: 'reveal', range: node.range });
        }
      });

      nodesGroup.appendChild(g);
    }

    svg.appendChild(edgesGroup);
    svg.appendChild(nodesGroup);
    root.appendChild(svg);
  } catch (err) {
    root.innerHTML = `<div class="error">Failed to render graph: ${err}</div>`;
    console.error('ELK layout error:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof __CFG__ !== 'undefined') {
    render(__CFG__);
  }
});
