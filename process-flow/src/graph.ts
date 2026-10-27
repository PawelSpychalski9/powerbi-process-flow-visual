import type powerbi from "powerbi-visuals-api";

export const roles = ["source", "target", "value", "tooltipId", "nodeTitle", "nodeDescription", "label", "group", "flowGroup"] as const;
export type Role = typeof roles[number];
export const MAX_EDGES = 1000;
export const MAX_NODES = 500;
export const MAX_TEXT_LENGTH = 4096;
export const MAX_TEXT_CHARACTERS = 1_000_000;

export interface GraphNode {
    id: string;
    title: string;
    description?: string;
    flowGroup?: string;
}

export interface GraphEdge {
    id: string;
    rowIndex: number;
    source: string;
    target: string;
    value: number;
    tooltipId?: string;
    label?: string;
    group?: string;
}

export interface Graph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface GraphResult extends Graph {
    status: "ready" | "empty" | "invalid";
    message: string;
    warnings: string[];
    skippedRows: number;
    inputRows: number;
}

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function text(value: powerbi.PrimitiveValue | undefined): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Interpret received table rows without aggregating or deduplicating edges. */
export function parseGraph(dataView?: powerbi.DataView): GraphResult {
    const base: GraphResult = {
        nodes: [], edges: [], status: "empty", message: "Assign Source, Target, and Value to display a process graph.",
        warnings: [], skippedRows: 0, inputRows: 0
    };
    const table = dataView?.table;
    if (!table) return base;
    if (!Array.isArray(table.columns) || (table.rows != null && !Array.isArray(table.rows))) {
        return { ...base, status: "invalid", message: "Invalid table data. Reassign the fields or refresh the visual." };
    }
    const columns = new Map<Role, number>();
    for (const role of roles) {
        const matches = table.columns.map((column, index) => column?.roles?.[role] ? index : -1).filter(index => index >= 0);
        if (matches.length > 1) return { ...base, status: "invalid", message: `Assign only one field to ${role}.` };
        if (matches.length === 1) columns.set(role, matches[0]);
    }
    const missing = ["source", "target", "value"].filter(role => !columns.has(role as Role));
    if (missing.length) return { ...base, message: `Assign the required fields: ${missing.join(", ")}.` };
    const rows = table.rows ?? [];
    base.inputRows = rows.length;
    if (dataView.metadata?.segment || rows.length > MAX_EDGES) {
        return { ...base, status: "invalid", message: `This graph is incomplete or exceeds ${MAX_EDGES} edges. Filter the report to a smaller graph.` };
    }
    if (!rows.length) return { ...base, message: "No connections match the current filters." };
    let characters = 0;
    for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const index of columns.values()) {
            const cell = row[index];
            if (typeof cell !== "string") continue;
            if (cell.length > MAX_TEXT_LENGTH) return { ...base, status: "invalid",
                message: `A text field exceeds ${MAX_TEXT_LENGTH} characters. Shorten the source text; IDs are never truncated or merged.` };
            characters += cell.length;
            if (characters > MAX_TEXT_CHARACTERS) return { ...base, status: "invalid",
                message: `This graph exceeds the ${MAX_TEXT_CHARACTERS} character text budget. Filter the report or shorten source text.` };
        }
    }
    const nodes = new Map<string, GraphNode>();
    const titles = new Map<string, Set<string>>();
    const descriptions = new Map<string, Set<string>>();
    const memberships = new Map<string, Set<string>>();
    const tooltipIds = new Set<string>();
    const warnings = new Set<string>();
    const edgeOccurrences = new Map<string, number>();
    rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) { base.skippedRows++; return; }
        const get = (role: Role): powerbi.PrimitiveValue | undefined => {
            const index = columns.get(role);
            return index === undefined ? undefined : row[index];
        };
        const source = text(get("source"));
        const target = text(get("target"));
        const value = get("value");
        if (!source || !target || typeof value !== "number" || !Number.isFinite(value)) {
            base.skippedRows++;
            return;
        }
        for (const id of [source, target]) {
            if (!nodes.has(id)) nodes.set(id, { id, title: id });
        }
        if (columns.has("flowGroup")) {
            const rawGroup = get("flowGroup");
            if (rawGroup != null && typeof rawGroup !== "string") warnings.add("Non-text Flow Group values were treated as ungrouped. Assign a Text field to Flow Group.");
            const membership = typeof rawGroup === "string" ? rawGroup.trim() : "";
            if (!memberships.has(source)) memberships.set(source, new Set());
            memberships.get(source)!.add(membership);
        }
        for (const [role, candidates] of [["nodeTitle", titles], ["nodeDescription", descriptions]] as const) {
            const content = text(get(role));
            if (content) {
                if (!candidates.has(source)) candidates.set(source, new Set());
                candidates.get(source)!.add(content);
            }
        }
        const tooltipId = text(get("tooltipId"));
        if (tooltipId) {
            if (tooltipIds.has(tooltipId)) warnings.add("Repeated Tooltip IDs were retained as separate edges; a 1:* detail relationship requires unique keys.");
            tooltipIds.add(tooltipId);
        }
        const label = text(get("label"));
        const group = text(get("group"));
        const fingerprint = JSON.stringify([source, target, value, tooltipId, label, group]);
        const occurrence = edgeOccurrences.get(fingerprint) ?? 0;
        edgeOccurrences.set(fingerprint, occurrence + 1);
        base.edges.push({ id: `${fingerprint}:${occurrence}`, rowIndex, source, target, value, tooltipId, label, group });
    });
    if (nodes.size > MAX_NODES) {
        return { ...base, edges: [], status: "invalid", message: `This graph exceeds ${MAX_NODES} nodes. Filter the report to a smaller graph.` };
    }
    for (const node of nodes.values()) {
        const assignedGroups = [...(memberships.get(node.id) ?? [])];
        if (assignedGroups.length === 1 && assignedGroups[0]) node.flowGroup = assignedGroups[0];
        if (assignedGroups.length > 1) warnings.add(`Conflicting Flow Group assignments for node ${node.id}. The node remains ungrouped; make all Source rows agree.`);
        const nodeTitles = [...(titles.get(node.id) ?? [])].sort(compare);
        const nodeDescriptions = [...(descriptions.get(node.id) ?? [])].sort(compare);
        node.title = nodeTitles[0] ?? node.id;
        node.description = nodeDescriptions[0];
        if (nodeTitles.length > 1 || nodeDescriptions.length > 1) {
            warnings.add("Conflicting source metadata was resolved using the lexicographically smallest non-empty title and description.");
        }
    }
    if (base.skippedRows) warnings.add(`${base.skippedRows} invalid row(s) skipped: Source and Target must be non-empty text; Value must be a finite number.`);
    base.nodes = [...nodes.values()].sort((a, b) => compare(a.id, b.id));
    base.edges.sort((a, b) => compare(a.id, b.id));
    base.warnings = [...warnings];
    base.status = base.edges.length ? "ready" : "invalid";
    base.message = base.edges.length ? `${base.nodes.length} nodes · ${base.edges.length} edges` : "No valid connections. Check Source, Target, and numeric Value.";
    return base;
}
