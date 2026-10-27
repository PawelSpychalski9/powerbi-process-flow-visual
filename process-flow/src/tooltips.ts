import powerbi from "powerbi-visuals-api";
import { GraphEdge } from "./graph";

/** Bind host identities to original table rows, never to layout/sort positions. */
export function edgeIdentities(host: powerbi.extensibility.visual.IVisualHost, table: powerbi.DataViewTable | undefined,
    edges: GraphEdge[]): Map<string, powerbi.visuals.ISelectionId> {
    const identities = new Map<string, powerbi.visuals.ISelectionId>();
    if (!table || !host.createSelectionIdBuilder) return identities;
    for (const edge of edges) {
        if (!table.identity?.[edge.rowIndex]) continue;
        const identity = host.createSelectionIdBuilder().withTable(table, edge.rowIndex).createSelectionId();
        if (identity.hasIdentity()) identities.set(edge.id, identity);
    }
    return identities;
}

export function edgeTooltipItems(edge: GraphEdge, locale?: string): powerbi.extensibility.VisualTooltipDataItem[] {
    let value: string;
    try { value = edge.value.toLocaleString(locale, { maximumSignificantDigits: 17 }); }
    catch { value = String(edge.value); }
    const items = [
        { displayName: "Source", value: edge.source },
        { displayName: "Target", value: edge.target },
        { displayName: "Value", value }
    ];
    const optional: [string, string | undefined][] = [["Label", edge.label], ["Group", edge.group], ["Tooltip ID", edge.tooltipId]];
    for (const [displayName, value] of optional) {
        if (value !== undefined && value !== "") items.push({ displayName, value });
    }
    return items;
}

/** Delegation covers both the line hit area and the complete value/label badge. */
export function bindEdgeTooltips(root: HTMLElement, service: powerbi.extensibility.ITooltipService | undefined,
    edges: GraphEdge[], identities: Map<string, powerbi.visuals.ISelectionId>, locale?: string): () => void {
    if (!service) return () => undefined;
    const byId = new Map(edges.map(edge => [edge.id, edge]));
    let active: string | undefined;
    const failed = (): void => {
        if (root.querySelector(".process-flow-tooltip-error")) return;
        const message = root.ownerDocument.createElement("div");
        message.className = "process-flow-tooltip-error process-flow-warning";
        message.setAttribute("role", "status");
        message.textContent = "Power BI tooltips are temporarily unavailable. Try hovering again or refresh the visual.";
        root.appendChild(message);
    };
    const targetId = (target: EventTarget | null): string | undefined => {
        const element = target as Element | null;
        const match = element?.closest?.("[data-edge-id]");
        return match && root.contains(match) ? match.getAttribute("data-edge-id") ?? undefined : undefined;
    };
    const hide = (): void => {
        try { if (active !== undefined) service.hide({ immediately: true, isTouchEvent: false }); }
        catch { failed(); }
        active = undefined;
    };
    const show = (event: PointerEvent): void => {
        // Touch navigation is left to the host; pointer hover supports mouse and pen.
        if (event.pointerType === "touch") return;
        const id = targetId(event.target);
        const edge = id === undefined ? undefined : byId.get(id);
        if (!edge || !service.enabled()) { hide(); return; }
        const identity = identities.get(edge.id);
        const options = {
            // Host coordinates use CSS pixels in the visual's iframe, independent of SVG zoom.
            coordinates: [event.clientX, event.clientY], isTouchEvent: false,
            dataItems: edgeTooltipItems(edge, locale), identities: identity ? [identity] : []
        };
        if (active === id) service.move(options);
        else { hide(); service.show(options); active = id; }
        root.querySelector(".process-flow-tooltip-error")?.remove();
    };
    const hover = (event: PointerEvent): void => {
        try { show(event); }
        catch { active = undefined; failed(); }
    };
    const leave = (event: PointerEvent): void => {
        if (targetId(event.relatedTarget) !== active) hide();
    };
    root.addEventListener("pointerover", hover);
    root.addEventListener("pointermove", hover);
    root.addEventListener("pointerout", leave);
    root.addEventListener("pointerleave", hide);
    root.addEventListener("pointerdown", hide);
    root.addEventListener("scroll", hide, true);
    root.addEventListener("click", hide);
    return () => {
        hide();
        root.removeEventListener("pointerover", hover);
        root.removeEventListener("pointermove", hover);
        root.removeEventListener("pointerout", leave);
        root.removeEventListener("pointerleave", hide);
        root.removeEventListener("pointerdown", hide);
        root.removeEventListener("scroll", hide, true);
        root.removeEventListener("click", hide);
    };
}
