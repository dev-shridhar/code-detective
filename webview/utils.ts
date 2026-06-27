import { CfgNode } from '../src/cfg/model';

export interface ElkNode { id: string; width: number; height: number; x?: number; y?: number }
export interface ElkEdge { id: string; sources: string[]; targets: string[]; sections?: Array<{ startPoint: {x:number,y:number}; endPoint: {x:number,y:number}; bendPoints?: Array<{x:number,y:number}> }> }

export function measure(n: CfgNode): { w: number; h: number } {
  const lines = n.label?.split('\n') ?? [''];
  const maxW = n.kind === 'entry' || n.kind === 'exit' ? 80 : 240;
  if (n.kind === 'entity') {
    return { w: 280, h: Math.max(50, lines.length * 20 + 16) };
  }
  return { w: maxW, h: n.kind === 'merge' ? 24 : 40 };
}

export function buildEdgeD(sec: ElkEdge['sections'][0]): string {
  let d = `M ${sec.startPoint.x} ${sec.startPoint.y}`;
  if (sec.bendPoints?.length) {
    for (const bp of sec.bendPoints) d += ` L ${bp.x} ${bp.y}`;
  }
  d += ` L ${sec.endPoint.x} ${sec.endPoint.y}`;
  return d;
}

export function midPoint(sec: ElkEdge['sections'][0]): { x: number; y: number } {
  if (sec.bendPoints?.length) {
    const bp = sec.bendPoints;
    const last = bp[bp.length - 1];
    return { x: (last.x + sec.endPoint.x) / 2, y: (last.y + sec.endPoint.y) / 2 };
  }
  return { x: (sec.startPoint.x + sec.endPoint.x) / 2, y: (sec.startPoint.y + sec.endPoint.y) / 2 };
}
