import { Graph, GraphEdge, GraphNode } from "./graph";

export interface PositionedNode extends GraphNode {
    x: number;
    y: number;
    width: number;
    height: number;
    rank: number;
    lines: string[];
}

export interface PositionedEdge extends GraphEdge {
    path: string;
    labelX: number;
    labelY: number;
    labelWidth: number;
    labelHeight: number;
    valueText: string;
    labelText?: string;
}

export interface GraphLayout {
    nodes: PositionedNode[];
    edges: PositionedEdge[];
    width: number;
    height: number;
}

const NODE_WIDTH = 156;
const NODE_HEIGHT = 76;
const ROW_GAP = 76;
const MARGIN = 36;
const LANE = 42;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function shorten(text: string, maxCharacters: number): string {
    const characters = Array.from(text);
    return characters.length <= maxCharacters ? text : characters.slice(0, maxCharacters - 1).join("") + "…";
}

/** Conservative widths keep wide glyphs inside the initial fixed-size SVG boxes. */
function textWidth(text: string, fontSize: number): number {
    return Array.from(text).reduce((width, character) => {
        const weight = /[MW@#%]/.test(character) || character.codePointAt(0)! > 255 ? 1 : 0.64;
        return width + fontSize * weight;
    }, 0);
}

function shortenToWidth(text: string, width: number, fontSize: number): string {
    if (textWidth(text, fontSize) <= width) return text;
    const characters = Array.from(text);
    let shortened = "";
    for (const character of characters) {
        if (textWidth(shortened + character + "…", fontSize) > width) break;
        shortened += character;
    }
    return shortened + "…";
}

function titleLines(title: string): string[] {
    const characters = Array.from(title.replace(/\s+/g, " ").trim());
    let first = "";
    let index = 0;
    while (index < characters.length && textWidth(first + characters[index], 14) <= NODE_WIDTH - 24) {
        first += characters[index++];
    }
    return index === characters.length ? [first] : [first, shortenToWidth(characters.slice(index).join(""), NODE_WIDTH - 24, 14)];
}

/** Iterative Kosaraju traversal: cycles cannot recurse forever or overflow the stack. */
function components(graph: Graph): string[][] {
    const ids = graph.nodes.map(node => node.id).sort(compare);
    const outgoing = new Map(ids.map(id => [id, new Set<string>()]));
    const incoming = new Map(ids.map(id => [id, new Set<string>()]));
    for (const edge of graph.edges) {
        outgoing.get(edge.source)!.add(edge.target);
        incoming.get(edge.target)!.add(edge.source);
    }
    const visited = new Set<string>();
    const finished: string[] = [];
    for (const id of ids) {
        const stack: Array<[string, boolean]> = [[id, false]];
        while (stack.length) {
            const [current, complete] = stack.pop()!;
            if (complete) { finished.push(current); continue; }
            if (visited.has(current)) continue;
            visited.add(current);
            stack.push([current, true]);
            for (const next of [...outgoing.get(current)!].sort(compare).reverse()) {
                if (!visited.has(next)) stack.push([next, false]);
            }
        }
    }
    const assigned = new Set<string>();
    const groups: string[][] = [];
    for (const id of finished.reverse()) {
        if (assigned.has(id)) continue;
        const group: string[] = [];
        const stack = [id];
        assigned.add(id);
        while (stack.length) {
            const current = stack.pop()!;
            group.push(current);
            for (const next of [...incoming.get(current)!].sort(compare).reverse()) {
                if (!assigned.has(next)) { assigned.add(next); stack.push(next); }
            }
        }
        groups.push(group.sort(compare));
    }
    return groups.sort((a, b) => compare(a[0], b[0]));
}

/** Rank the acyclic component graph; nodes inside a cycle share a column. */
export function layoutGraph(graph: Graph, locale = "en-US"): GraphLayout {
    if (!graph.nodes.length) return { nodes: [], edges: [], width: 0, height: 0 };
    const groups = components(graph);
    const groupOf = new Map<string, number>();
    groups.forEach((group, index) => group.forEach(id => groupOf.set(id, index)));
    const outgoing = groups.map(() => new Set<number>());
    const indegree = groups.map(() => 0);
    const rank = groups.map(() => 0);
    for (const edge of graph.edges) {
        const source = groupOf.get(edge.source)!;
        const target = groupOf.get(edge.target)!;
        if (source !== target && !outgoing[source].has(target)) {
            outgoing[source].add(target);
            indegree[target]++;
        }
    }
    const queue = groups.map((_, index) => index).filter(index => indegree[index] === 0);
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const source = queue[cursor];
        for (const target of [...outgoing[source]].sort((a, b) => a - b)) {
            rank[target] = Math.max(rank[target], rank[source] + 1);
            if (--indegree[target] === 0) queue.push(target);
        }
    }
    const nodeRank = (id: string): number => rank[groupOf.get(id)!];
    const columns: GraphNode[][] = Array.from({ length: Math.max(...rank) + 1 }, () => []);
    for (const node of [...graph.nodes].sort((a, b) => compare(a.id, b.id))) columns[nodeRank(node.id)].push(node);
    const edges = [...graph.edges].sort((a, b) => compare(a.id, b.id));
    const topEdges = edges.filter(edge => nodeRank(edge.target) - nodeRank(edge.source) > 1);
    const sideCounts = columns.map(() => 0);
    const pairCounts = new Map<string, number>();
    for (const edge of edges) {
        if (nodeRank(edge.source) === nodeRank(edge.target)) sideCounts[nodeRank(edge.source)]++;
        const pair = JSON.stringify([edge.source, edge.target]);
        pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
    const gap = 180;
    const parallelMargin = (Math.max(1, ...pairCounts.values()) - 1) * LANE / 2;
    const top = MARGIN + topEdges.length * LANE + parallelMargin;
    const contentHeight = Math.max(...columns.map(column => column.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP));
    const nodes: PositionedNode[] = [];
    let x = MARGIN;
    columns.forEach((column, index) => {
        const columnHeight = column.length * (NODE_HEIGHT + ROW_GAP) - ROW_GAP;
        column.forEach((node, row) => nodes.push({
            ...node, x, y: top + (contentHeight - columnHeight) / 2 + row * (NODE_HEIGHT + ROW_GAP),
            width: NODE_WIDTH, height: NODE_HEIGHT, rank: index, lines: titleLines(node.title)
        }));
        x += NODE_WIDTH + gap + sideCounts[index] * LANE;
    });
    const byId = new Map(nodes.map(node => [node.id, node]));
    const pairIndex = new Map<string, number>();
    let numberFormat: Intl.NumberFormat;
    try { numberFormat = new Intl.NumberFormat(locale, { maximumSignificantDigits: 12 }); }
    catch { numberFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 12 }); }
    const sideIndex = columns.map(() => 0);
    let topIndex = 0;
    let maxY = top + contentHeight;
    const positionedEdges: PositionedEdge[] = edges.map(edge => {
        const source = byId.get(edge.source)!;
        const target = byId.get(edge.target)!;
        const startX = source.x + source.width;
        const startY = source.y + source.height / 2;
        const endX = target.x;
        const endY = target.y + target.height / 2;
        let path: string;
        let labelX: number;
        let labelY: number;
        const pair = JSON.stringify([edge.source, edge.target]);
        const occurrence = pairIndex.get(pair) ?? 0;
        pairIndex.set(pair, occurrence + 1);
        if (source.rank === target.rank) {
            const lane = ++sideIndex[source.rank];
            const outerX = startX + 88 + lane * LANE;
            if (source.id === target.id) {
                // Separate top and bottom ports keep a self-loop's arrow visible.
                const loopBottom = source.y + source.height + 28 + occurrence * LANE;
                path = `M ${startX} ${startY} L ${outerX} ${startY} L ${outerX} ${loopBottom} L ${source.x + source.width / 2} ${loopBottom} L ${source.x + source.width / 2} ${source.y + source.height}`;
                labelX = outerX;
                labelY = loopBottom - 13;
                maxY = Math.max(maxY, loopBottom + 32);
            } else {
                path = `M ${startX} ${startY} C ${outerX} ${startY}, ${outerX} ${endY}, ${target.x + target.width} ${endY}`;
                labelX = startX + (outerX - startX) * 0.75;
                labelY = (startY + endY) / 2;
            }
        } else if (target.rank - source.rank > 1) {
            const laneY = MARGIN + topIndex++ * LANE;
            path = `M ${startX} ${startY} L ${startX + 20} ${startY} L ${startX + 20} ${laneY} L ${endX - 20} ${laneY} L ${endX - 20} ${endY} L ${endX} ${endY}`;
            labelX = (startX + endX) / 2;
            labelY = laneY;
        } else {
            const offset = (occurrence - (pairCounts.get(pair)! - 1) / 2) * LANE;
            const middleX = (startX + endX) / 2;
            path = `M ${startX} ${startY} C ${middleX} ${startY + offset}, ${middleX} ${endY + offset}, ${endX} ${endY}`;
            labelX = middleX;
            labelY = (startY + endY) / 2 + offset * 0.75;
            maxY = Math.max(maxY, startY + offset, endY + offset);
        }
        let valueText = numberFormat.format(edge.value);
        if (textWidth(valueText, 13) > 150) {
            valueText = new Intl.NumberFormat(numberFormat.resolvedOptions().locale, { notation: "scientific", maximumSignificantDigits: 6 }).format(edge.value);
        }
        const labelText = edge.label ? shortenToWidth(edge.label.replace(/\s+/g, " "), 148, 11) : undefined;
        const labelWidth = Math.max(40, textWidth(valueText, 13) + 14, textWidth(labelText ?? "", 11) + 14);
        return { ...edge, path, labelX, labelY, labelWidth, labelHeight: labelText ? 38 : 22, valueText, labelText };
    });
    const width = Math.max(...nodes.map(node => node.x + node.width), ...positionedEdges.map(edge => edge.labelX + edge.labelWidth / 2 + 40)) + MARGIN;
    const height = Math.max(maxY, ...positionedEdges.map(edge => edge.labelY + edge.labelHeight / 2)) + MARGIN;
    return { nodes, edges: positionedEdges, width, height };
}
