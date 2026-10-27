import powerbi from "powerbi-visuals-api";
import { GraphEdge } from "./graph";

/** One manager per visual. Row identities are shared with native tooltips. */
export class GraphInteractions {
    private edges: GraphEdge[] = [];
    private identities = new Map<string, powerbi.visuals.ISelectionId>();
    private selected: powerbi.visuals.ISelectionId[] = [];
    private allowed = true;
    private destroyed = false;
    private revision = 0;
    private generation = 0;
    private queue: Promise<void> = Promise.resolve();

    constructor(private readonly root: HTMLElement, private readonly manager?: powerbi.extensibility.ISelectionManager) {
        manager?.registerOnSelectCallback(ids => {
            if (this.destroyed) return;
            this.revision++;
            this.selected = ids as powerbi.visuals.ISelectionId[];
            this.paint();
        });
        root.addEventListener("click", this.click);
        root.addEventListener("contextmenu", this.contextMenu);
    }

    public update(edges: GraphEdge[], identities: Map<string, powerbi.visuals.ISelectionId>, allowed: boolean): void {
        this.generation++;
        this.edges = edges;
        this.identities = identities;
        this.allowed = allowed;
        this.selected = (this.manager?.getSelectionIds() ?? []) as powerbi.visuals.ISelectionId[];
        this.paint();
    }

    private element(target: EventTarget | null, selector: string): Element | undefined {
        const match = (target as Element | null)?.closest?.(selector);
        return match && this.root.contains(match) ? match : undefined;
    }

    private nodeIdentities(nodeId: string): powerbi.visuals.ISelectionId[] {
        const incident = this.edges.filter(edge => edge.source === nodeId || edge.target === nodeId);
        const ids = incident.map(edge => this.identities.get(edge.id));
        // Avoid sending a misleading partial node selection when some rows have no identity.
        return ids.length && ids.every(id => id !== undefined) ?
            [...new Map(ids.map(id => [id!.getKey(), id!])).values()] : [];
    }

    private click = (event: MouseEvent): void => {
        if (!this.allowed || !this.manager || event.button !== 0 || this.element(event.target, ".process-flow-zoom")) return;
        const edge = this.element(event.target, "[data-edge-id]");
        const node = this.element(event.target, "[data-node-id]");
        if (edge) {
            const id = this.identities.get(edge.getAttribute("data-edge-id")!);
            if (id) this.run(() => this.manager!.select(id, event.ctrlKey || event.metaKey));
        } else if (node) {
            const ids = this.nodeIdentities(node.getAttribute("data-node-id")!);
            if (ids.length) this.run(() => this.manager!.select(ids, event.ctrlKey || event.metaKey));
        } else if (this.element(event.target, ".process-flow-viewport")) {
            this.run(() => this.manager!.clear());
        }
    };

    private contextMenu = (event: MouseEvent): void => {
        if (!this.allowed || !this.manager) return;
        event.preventDefault();
        const edge = this.element(event.target, "[data-edge-id]");
        const node = this.element(event.target, "[data-node-id]");
        const nodeIds = node ? this.nodeIdentities(node.getAttribute("data-node-id")!) : [];
        // The context-menu API accepts one identity; a multi-row node has no single row identity.
        const id = edge ? this.identities.get(edge.getAttribute("data-edge-id")!) : nodeIds.length === 1 ? nodeIds[0] : undefined;
        const position = { x: event.clientX, y: event.clientY };
        this.run(() => this.manager!.showContextMenu(id ?? {}, position));
    };

    private run(operation: () => powerbi.IPromise<unknown>): void {
        const generation = this.generation;
        // Serialize rapid clicks so host responses cannot reorder the user's selections.
        this.queue = this.queue.then(async () => {
            if (this.destroyed || !this.allowed || generation !== this.generation) return;
            const revision = this.revision;
            try {
                await operation();
                if (this.destroyed || !this.allowed) return;
                if (revision === this.revision) this.selected = this.manager!.getSelectionIds() as powerbi.visuals.ISelectionId[];
                this.root.querySelector(".process-flow-interaction-error")?.remove();
                this.paint();
            } catch {
                if (this.destroyed) return;
                if (!this.root.querySelector(".process-flow-interaction-error")) {
                    const message = this.root.ownerDocument.createElement("div");
                    message.className = "process-flow-interaction-error";
                    message.setAttribute("role", "status");
                    message.textContent = "Power BI could not apply this interaction. Try again or refresh the visual.";
                    this.root.appendChild(message);
                }
            }
        });
    }

    private paint(): void {
        if (this.destroyed) return;
        const selectedEdges = new Set<string>();
        for (const [edgeId, identity] of this.identities) {
            if (this.selected.some(id => id.hasIdentity() && (id.equals(identity) || id.includes(identity)))) selectedEdges.add(edgeId);
        }
        const selectedNodes = new Set(this.edges.filter(edge => selectedEdges.has(edge.id)).flatMap(edge => [edge.source, edge.target]));
        const showSelection = selectedEdges.size > 0;
        for (const element of Array.from(this.root.querySelectorAll<SVGElement>("[data-edge-id], [data-node-id]"))) {
            const edgeId = element.getAttribute("data-edge-id");
            const nodeId = element.getAttribute("data-node-id");
            const selected = edgeId !== null ? selectedEdges.has(edgeId) : selectedNodes.has(nodeId!);
            const selectable = edgeId !== null ? this.identities.has(edgeId) : this.nodeIdentities(nodeId!).length > 0;
            element.dataset.selected = String(selected);
            element.dataset.selectable = String(this.allowed && !!this.manager && selectable);
            // Keep hit areas opaque to pointer testing; only visible marks are dimmed.
            if (!element.classList.contains("process-flow-edge-hit")) element.style.opacity = showSelection && !selected ? "0.3" : "1";
        }
    }

    public destroy(): void {
        this.destroyed = true;
        this.root.removeEventListener("click", this.click);
        this.root.removeEventListener("contextmenu", this.contextMenu);
        // The SDK has no unregister API; the registered callback becomes inert on destroy.
    }
}
