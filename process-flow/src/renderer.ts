import { GraphResult } from "./graph";
import { layoutGraph, shorten } from "./layout";
import { Appearance, GraphSettings, readSettings, resolveAppearance } from "./formatting";
import type { GroupColors } from "./groupColors";

export interface RenderOptions {
    width: number;
    height: number;
    accent: string;
    markerId: string;
    locale?: string;
    zoom?: ZoomState;
    settings?: GraphSettings;
    appearance?: Appearance;
    allowInteractions?: boolean;
    groupColors?: ReadonlyMap<string, GroupColors>;
}

export interface ZoomState {
    scale: number;
    mode: "manual" | "fit";
    scrollLeft: number;
    scrollTop: number;
}

export function createZoomState(): ZoomState {
    return { scale: 1, mode: "manual", scrollLeft: 0, scrollTop: 0 };
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(document: Document, name: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
}

export function renderGraph(container: HTMLElement, result: GraphResult, options: RenderOptions): void {
    const document = container.ownerDocument;
    container.replaceChildren();
    container.removeAttribute("role");
    container.className = "process-flow";
    container.style.width = `${Math.max(0, options.width)}px`;
    container.style.height = `${Math.max(0, options.height)}px`;
    const settings = options.settings ?? readSettings();
    const appearance = options.appearance ?? resolveAppearance(settings, undefined, options.accent);
    const allowInteractions = options.allowInteractions !== false;
    container.style.setProperty("--flow-fg", appearance.foreground);
    container.style.setProperty("--flow-bg", appearance.background);
    container.style.setProperty("--flow-active", appearance.active);
    container.style.setProperty("--flow-font-size", `${settings.fontSize}px`);
    container.style.setProperty("--flow-small-font-size", `${Math.max(10, settings.fontSize - 2)}px`);
    container.style.setProperty("--flow-title-font-size", `${settings.fontSize + 1}px`);
    container.dataset.highContrast = String(appearance.highContrast);
    container.dataset.interactive = String(allowInteractions);
    const summary = document.createElement("div");
    summary.className = "process-flow-summary";
    summary.setAttribute("role", "status");
    summary.textContent = result.message;
    container.appendChild(summary);
    for (const warning of result.warnings) {
        const message = document.createElement("div");
        message.className = "process-flow-warning";
        message.setAttribute("role", "status");
        message.textContent = warning;
        container.appendChild(message);
    }
    if (result.status !== "ready") {
        const state = document.createElement("div");
        state.className = "process-flow-state";
        state.setAttribute("role", result.status === "invalid" ? "alert" : "note");
        const heading = document.createElement("h2");
        heading.textContent = result.status === "invalid" ? "Check your data" : "Build a process graph";
        const help = document.createElement("p");
        help.textContent = result.message.includes("Assign") ?
            "Add text fields to Source and Target, and a numeric column or measure to Value. Optional: Tooltip ID, Node Title, Node Description, Label, Group, and Flow Group." :
            "Check the current filters and field assignments. Each connection needs non-empty text IDs and a finite numeric Value.";
        state.append(heading, help);
        container.appendChild(state);
        return;
    }
    if (!options.width || !options.height) return;
    const layout = layoutGraph(result, options.locale, settings);
    const viewport = document.createElement("div");
    viewport.className = "process-flow-viewport";
    viewport.tabIndex = allowInteractions ? 0 : -1;
    if (!allowInteractions) viewport.style.overflow = "hidden";
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", "Process graph. Scroll to explore connections beyond the viewport.");
    const svg = svgElement(document, "svg", {
        width: layout.width, height: layout.height,
        viewBox: `0 0 ${layout.width} ${layout.height}`,
        role: "img", "aria-label": result.message, class: "process-flow-graph"
    });
    const defs = svgElement(document, "defs");
    const marker = svgElement(document, "marker", {
        id: options.markerId, viewBox: "0 0 10 10", refX: 9, refY: 5,
        markerWidth: 7, markerHeight: 7, orient: "auto", markerUnits: "strokeWidth"
    });
    marker.appendChild(svgElement(document, "path", { d: "M 0 0 L 10 5 L 0 10 z", fill: appearance.edgeColor }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    if (layout.groups?.length) {
        const containers = svgElement(document, "g", { class: "process-flow-groups" });
        for (const group of layout.groups) {
            const saved = options.groupColors?.get(group.id);
            const custom = saved && !saved.inherit && !appearance.highContrast ? saved : undefined;
            const container = svgElement(document, "g", {
                class: "process-flow-group", "data-flow-group": group.id, role: "group", "aria-label": `Flow group ${group.title}`
            });
            container.appendChild(svgElement(document, "rect", {
                x: group.x, y: group.y, width: group.width, height: group.height, rx: settings.flowGroupRadius,
                fill: custom?.background ?? appearance.groupBackground,
                "fill-opacity": settings.flowGroupShowBackground ? (appearance.highContrast ? 1 : settings.flowGroupOpacity / 100) : 0,
                stroke: custom?.border ?? appearance.groupBorder,
                "stroke-width": appearance.highContrast ? Math.max(2, settings.flowGroupBorderWidth) : settings.flowGroupBorderWidth
            }));
            const title = svgElement(document, "text", {
                class: "process-flow-group-title", x: group.x + settings.flowGroupPadding,
                y: group.y + settings.flowGroupPadding + settings.flowGroupTitleSize,
                fill: custom?.titleColor ?? appearance.groupTitle, "font-size": settings.flowGroupTitleSize, "font-weight": 600
            });
            title.textContent = shorten(group.title.replace(/\s+/g, " "), Math.max(2, Math.floor((group.width - settings.flowGroupPadding * 2) / settings.flowGroupTitleSize)));
            container.appendChild(title);
            containers.appendChild(container);
        }
        svg.appendChild(containers);
    }

    const paths = svgElement(document, "g", { class: "process-flow-edges" });
    const labels = svgElement(document, "g", { class: "process-flow-edge-labels" });
    for (const edge of layout.edges) {
        paths.appendChild(svgElement(document, "path", {
            class: "process-flow-edge", d: edge.path, fill: "none", stroke: appearance.edgeColor,
            "stroke-width": appearance.highContrast ? Math.max(2, settings.edgeWidth) : settings.edgeWidth,
            "marker-end": `url(#${options.markerId})`,
            "data-edge-id": edge.id, "data-source": edge.source, "data-target": edge.target
        }));
        const group = svgElement(document, "g", {
            class: "process-flow-edge-label", transform: `translate(${edge.labelX},${edge.labelY})`,
            "data-edge-id": edge.id
        });
        paths.appendChild(svgElement(document, "path", {
            class: "process-flow-edge-hit", d: edge.path, fill: "none", stroke: "transparent",
            "stroke-width": Math.max(12, settings.edgeWidth), "pointer-events": "stroke",
            "vector-effect": "non-scaling-stroke", "data-edge-id": edge.id, "aria-hidden": "true"
        }));
        group.appendChild(svgElement(document, "rect", {
            x: -edge.labelWidth / 2, y: -edge.labelHeight / 2,
            width: edge.labelWidth, height: edge.labelHeight, rx: 4,
            fill: appearance.background, stroke: appearance.foreground, "stroke-width": appearance.highContrast ? 2 : 0.5
        }));
        const value = svgElement(document, "text", {
            class: "process-flow-value", "text-anchor": "middle", y: edge.labelText ? -3 : settings.fontSize * 0.35
        });
        value.textContent = edge.valueText;
        group.appendChild(value);
        if (edge.labelText) {
            const label = svgElement(document, "text", { class: "process-flow-label", "text-anchor": "middle", y: settings.fontSize / 2 + 6 });
            label.textContent = edge.labelText;
            group.appendChild(label);
        }
        labels.appendChild(group);
    }
    svg.appendChild(paths);
    svg.appendChild(labels);
    const nodes = svgElement(document, "g", { class: "process-flow-nodes" });
    for (const node of layout.nodes) {
        const group = svgElement(document, "g", {
            class: "process-flow-node", transform: `translate(${node.x},${node.y})`,
            "data-node-id": node.id, "aria-label": `${node.title} (${node.id})`
        });
        group.appendChild(svgElement(document, "rect", {
            width: node.width, height: node.height, rx: 7, stroke: appearance.nodeBorder,
            fill: appearance.nodeFill, "stroke-width": appearance.highContrast ? Math.max(2, settings.nodeBorderWidth) : settings.nodeBorderWidth
        }));
        const text = svgElement(document, "text", { "text-anchor": "middle", class: "process-flow-node-title" });
        node.lines.forEach((line, index) => {
            const span = svgElement(document, "tspan", { x: node.width / 2, y: node.height * 0.33 + index * (settings.fontSize + 4) });
            span.textContent = line;
            text.appendChild(span);
        });
        group.appendChild(text);
        if (node.title !== node.id) {
            const id = svgElement(document, "text", {
                class: "process-flow-node-id", x: node.width / 2, y: node.height - 10, "text-anchor": "middle"
            });
            id.textContent = node.id.length > 20 ? node.id.slice(0, 19) + "…" : node.id;
            group.appendChild(id);
        }
        nodes.appendChild(group);
    }
    svg.appendChild(nodes);
    viewport.appendChild(svg);
    container.appendChild(viewport);

    const zoom: ZoomState = allowInteractions ? options.zoom ?? createZoomState() : { ...createZoomState(), mode: "fit" };
    const toolbar = document.createElement("div");
    toolbar.className = "process-flow-zoom";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Graph zoom controls");
    const button = (text: string, label: string): HTMLButtonElement => {
        const control = document.createElement("button");
        control.type = "button";
        control.textContent = text;
        control.setAttribute("aria-label", label);
        control.title = label;
        toolbar.appendChild(control);
        return control;
    };
    const zoomOut = button("−", "Zoom out");
    const zoomIn = button("+", "Zoom in");
    const percentage = document.createElement("output");
    percentage.className = "process-flow-zoom-percentage";
    percentage.setAttribute("aria-label", "Zoom level");
    percentage.setAttribute("aria-live", "polite");
    toolbar.appendChild(percentage);
    const fit = button("Fit", "Fit graph to view");
    if (allowInteractions) container.appendChild(toolbar);

    const viewportSize = (): { width: number; height: number } => ({
        width: viewport.clientWidth || options.width,
        height: viewport.clientHeight || Math.max(1, options.height - (summary.offsetHeight || 28) - (allowInteractions ? 42 : 0) - result.warnings.length * 44)
    });
    const fitScale = (): number => {
        const size = viewportSize();
        return Math.max(Number.EPSILON, Math.min(1, (size.width - 2) / layout.width, (size.height - 2) / layout.height));
    };
    const updateScale = (scale: number, preserveCenter: boolean): void => {
        const size = viewportSize();
        const centerX = (viewport.scrollLeft + size.width / 2) / zoom.scale;
        const centerY = (viewport.scrollTop + size.height / 2) / zoom.scale;
        zoom.scale = scale;
        svg.setAttribute("width", String(layout.width * scale));
        svg.setAttribute("height", String(layout.height * scale));
        percentage.textContent = `${Number((scale * 100).toFixed(scale < 0.01 ? 2 : 0))}%`;
        fit.setAttribute("aria-pressed", String(zoom.mode === "fit"));
        zoomOut.disabled = scale <= Math.min(0.1, fitScale()) + Number.EPSILON;
        zoomIn.disabled = scale >= 4;
        if (preserveCenter) {
            zoom.scrollLeft = Math.max(0, centerX * scale - size.width / 2);
            zoom.scrollTop = Math.max(0, centerY * scale - size.height / 2);
        }
        viewport.scrollLeft = zoom.scrollLeft;
        viewport.scrollTop = zoom.scrollTop;
    };
    viewport.addEventListener("scroll", () => {
        zoom.scrollLeft = viewport.scrollLeft;
        zoom.scrollTop = viewport.scrollTop;
    });
    zoomOut.addEventListener("click", () => {
        zoom.mode = "manual";
        updateScale(Math.max(Math.min(0.1, fitScale()), zoom.scale / 1.25), true);
    });
    zoomIn.addEventListener("click", () => {
        zoom.mode = "manual";
        updateScale(Math.min(4, zoom.scale * 1.25), true);
    });
    fit.addEventListener("click", () => {
        zoom.mode = "fit";
        zoom.scrollLeft = 0;
        zoom.scrollTop = 0;
        // Remove existing scrollbars before measuring the available fit area.
        svg.setAttribute("width", "1");
        svg.setAttribute("height", "1");
        updateScale(fitScale(), false);
    });
    if (zoom.mode === "fit") {
        zoom.scrollLeft = 0;
        zoom.scrollTop = 0;
        svg.setAttribute("width", "1");
        svg.setAttribute("height", "1");
    }
    updateScale(zoom.mode === "fit" ? fitScale() : zoom.scale, false);
}
