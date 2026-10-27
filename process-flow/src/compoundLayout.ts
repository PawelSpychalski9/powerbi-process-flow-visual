import type { Graph, GraphEdge } from "./graph";
import type { GraphSettings } from "./formatting";
import type { GraphLayout, PositionedEdge, PositionedGroup, PositionedNode } from "./layout";
import { stylePolyline } from "./routing";

type FlatLayout = (graph: Graph, locale: string, settings: GraphSettings) => GraphLayout;
interface Block {
    id: string;
    name?: string;
    local: GraphLayout;
    x: number;
    y: number;
    width: number;
    height: number;
    rank: number;
    inset: number;
    header: number;
}

const MARGIN = 36;
const ROAD_STEP = 8;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** The renderer emits absolute M/L/C/Q commands only; translate their coordinate pairs. */
function translatePath(path: string, dx: number, dy: number): string {
    let index = 0;
    return path.replace(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi,
        value => String(Number(value) + (index++ % 2 === 0 ? dx : dy)));
}

/** Reuse the existing SCC layout for each container and the graph of container blocks. */
export function layoutCompoundGraph(graph: Graph, locale: string, settings: GraphSettings, flat: FlatLayout): GraphLayout {
    const blockOf = new Map<string, string>();
    const members = new Map<string, Graph["nodes"]>();
    const names = new Map<string, string>();
    for (const node of graph.nodes) {
        const id = JSON.stringify(node.flowGroup ? ["group", node.flowGroup] : ["node", node.id]);
        blockOf.set(node.id, id);
        if (!members.has(id)) members.set(id, []);
        members.get(id)!.push(node);
        if (node.flowGroup) names.set(id, node.flowGroup);
    }
    const internal = new Map([...members.keys()].map(id => [id, [] as GraphEdge[]]));
    const crossing: GraphEdge[] = [];
    for (const edge of [...graph.edges].sort((a, b) => compare(a.id, b.id))) {
        const source = blockOf.get(edge.source)!;
        if (source === blockOf.get(edge.target)) internal.get(source)!.push(edge);
        else crossing.push(edge);
    }
    const blocks: Block[] = [...members.keys()].sort(compare).map(id => {
        const name = names.get(id);
        const local = flat({ nodes: members.get(id)!, edges: internal.get(id)! }, locale, settings);
        const inset = name ? settings.flowGroupPadding : 0;
        const header = name ? settings.flowGroupTitleSize + 16 : 0;
        return { id, name, local, x: 0, y: 0, rank: 0, inset, header,
            width: Math.max(local.width + inset * 2, name ? Math.min(420, Array.from(name).length * settings.flowGroupTitleSize) + inset * 2 : 0),
            height: local.height + inset * 2 + header };
    });
    const byBlock = new Map(blocks.map(block => [block.id, block]));
    const outer = flat({ nodes: blocks.map(block => ({ id: block.id, title: block.id })),
        edges: crossing.map(edge => ({ ...edge, source: blockOf.get(edge.source)!, target: blockOf.get(edge.target)! })) }, locale, settings);
    const outerNodes = new Map(outer.nodes.map(node => [node.id, node]));
    for (const block of blocks) block.rank = outerNodes.get(block.id)!.rank;
    const localNode = new Map(blocks.flatMap(block => block.local.nodes.map(node => [node.id, node] as const)));
    const direct = (edge: GraphEdge): boolean => {
        const source = byBlock.get(blockOf.get(edge.source)!)!;
        const target = byBlock.get(blockOf.get(edge.target)!)!;
        return target.rank === source.rank + 1 &&
            localNode.get(edge.source)!.x === Math.max(...source.local.nodes.map(node => node.x)) &&
            localNode.get(edge.target)!.x === Math.min(...target.local.nodes.map(node => node.x));
    };
    const ranks = Math.max(...blocks.map(block => block.rank)) + 1;
    const columns: Block[][] = Array.from({ length: ranks }, () => []);
    for (const block of blocks) columns[block.rank].push(block);
    const outgoing = columns.map(() => 0);
    const incoming = columns.map(() => 0);
    for (const edge of crossing) {
        outgoing[byBlock.get(blockOf.get(edge.source)!)!.rank]++;
        incoming[byBlock.get(blockOf.get(edge.target)!)!.rank]++;
    }
    const annotation = new Map(flat(graph, locale, settings).edges.map(edge => [edge.id, edge]));
    const labelLane = Math.max(42, settings.fontSize * 2 + 24);
    const top = MARGIN + crossing.filter(edge => !direct(edge)).length * labelLane;
    const rowGap = Math.max(48, settings.verticalSpacing);
    const columnHeight = (column: Block[]): number => column.reduce((sum, block) => sum + block.height, 0) + Math.max(0, column.length - 1) * rowGap;
    const fullHeight = Math.max(...columns.map(columnHeight));
    const columnLeft: number[] = [];
    const columnRight: number[] = [];
    let x = MARGIN + incoming[0] * ROAD_STEP + 24;
    columns.forEach((column, rank) => {
        column.sort((a, b) => outerNodes.get(a.id)!.y - outerNodes.get(b.id)!.y || compare(a.id, b.id));
        const width = Math.max(...column.map(block => block.width));
        columnLeft[rank] = x;
        columnRight[rank] = x + width;
        let y = top + (fullHeight - columnHeight(column)) / 2;
        for (const block of column) {
            block.x = x;
            block.y = y;
            y += block.height + rowGap;
        }
        x += width + Math.max(settings.horizontalSpacing, settings.fontSize * 12 + 32) +
            outgoing[rank] * ROAD_STEP + (incoming[rank + 1] ?? 0) * ROAD_STEP + 48;
    });
    const nodes: PositionedNode[] = [];
    const edges: PositionedEdge[] = [];
    const groups: PositionedGroup[] = [];
    for (const block of blocks) {
        const dx = block.x + block.inset;
        const dy = block.y + block.inset + block.header;
        for (const node of block.local.nodes) nodes.push({ ...node, x: node.x + dx, y: node.y + dy });
        for (const edge of block.local.edges) edges.push({ ...edge, path: translatePath(edge.path, dx, dy), labelX: edge.labelX + dx, labelY: edge.labelY + dy });
        if (block.name) groups.push({ id: block.name, title: block.name, x: block.x, y: block.y,
            width: block.width, height: block.height, nodeIds: block.local.nodes.map(node => node.id) });
    }
    const byNode = new Map(nodes.map(node => [node.id, node]));
    const sourceRoad = columns.map(() => 0);
    const targetRoad = columns.map(() => 0);
    const directRoad = columns.map(() => 0);
    const usedLabels: { x: number; y: number; width: number; height: number }[] = [];
    let upperLane = 0;
    for (const edge of crossing) {
        const source = byNode.get(edge.source)!;
        const target = byNode.get(edge.target)!;
        const sourceBlock = byBlock.get(blockOf.get(edge.source)!)!;
        const targetBlock = byBlock.get(blockOf.get(edge.target)!)!;
        const startX = source.x + source.width;
        const startY = source.y + source.height / 2;
        const endX = target.x;
        const endY = target.y + target.height / 2;
        const formatted = annotation.get(edge.id)!;
        let path: string;
        let labelX: number;
        let labelY: number;
        if (direct(edge)) {
            labelX = (columnRight[sourceBlock.rank] + columnLeft[targetBlock.rank]) / 2 +
                (directRoad[sourceBlock.rank]++ - (outgoing[sourceBlock.rank] - 1) / 2) * ROAD_STEP;
            labelY = (startY + endY) / 2;
            const occupied = usedLabels.filter(box => Math.abs(box.x - labelX) < (box.width + formatted.labelWidth) / 2 + 8)
                .map(box => ({ start: box.y - (box.height + formatted.labelHeight) / 2 - 8,
                    end: box.y + (box.height + formatted.labelHeight) / 2 + 8 })).sort((a, b) => a.start - b.start);
            for (const interval of occupied) if (labelY >= interval.start && labelY <= interval.end) labelY = interval.end + 4;
            // Place labels in the inter-column corridor, never on a container title or node.
            path = `M ${startX} ${startY} L ${labelX} ${startY} L ${labelX} ${labelY} L ${labelX} ${endY} L ${endX} ${endY}`;
        } else {
            labelY = MARGIN + upperLane++ * labelLane;
            const exitX = columnRight[sourceBlock.rank] + 24 + sourceRoad[sourceBlock.rank]++ * ROAD_STEP;
            const entryX = columnLeft[targetBlock.rank] - 24 - targetRoad[targetBlock.rank]++ * ROAD_STEP;
            const exitY = sourceBlock.y + sourceBlock.height + 12;
            const entryY = targetBlock.y + targetBlock.height + 12;
            labelX = (exitX + entryX) / 2;
            // Inner ports sit in the gaps between node columns. Exterior roads avoid all blocks.
            path = `M ${startX} ${startY} L ${startX + 8} ${startY} L ${startX + 8} ${exitY} L ${exitX} ${exitY} L ${exitX} ${labelY} L ${entryX} ${labelY} L ${entryX} ${entryY} L ${endX - 8} ${entryY} L ${endX - 8} ${endY} L ${endX} ${endY}`;
        }
        usedLabels.push({ x: labelX, y: labelY, width: formatted.labelWidth, height: formatted.labelHeight });
        edges.push({ ...formatted, path: stylePolyline(path, settings.orthogonalEdges), labelX, labelY });
    }
    const width = Math.max(...blocks.map(block => block.x + block.width + outgoing[block.rank] * ROAD_STEP + 24),
        ...edges.map(edge => edge.labelX + edge.labelWidth / 2)) + MARGIN;
    const height = Math.max(...blocks.map(block => block.y + block.height + 24), ...edges.map(edge => edge.labelY + edge.labelHeight / 2)) + MARGIN;
    const xRanks = [...new Set(nodes.map(node => node.x))].sort((a, b) => a - b);
    for (const node of nodes) node.rank = xRanks.indexOf(node.x);
    return { nodes: nodes.sort((a, b) => compare(a.id, b.id)), edges: edges.sort((a, b) => compare(a.id, b.id)), groups, width, height };
}
