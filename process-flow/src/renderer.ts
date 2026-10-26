import { GraphResult } from "./graph";
import { layoutGraph } from "./layout";

export interface RenderOptions {
    width: number;
    height: number;
    accent: string;
    markerId: string;
    locale?: string;
    zoom?: ZoomState;
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
    if (result.status !== "ready" || !options.width || !options.height) return;
    const layout = layoutGraph(result, options.locale);
    const viewport = document.createElement("div");
    viewport.className = "process-flow-viewport";
    viewport.tabIndex = 0;
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
    marker.appendChild(svgElement(document, "path", { d: "M 0 0 L 10 5 L 0 10 z", fill: options.accent }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    const paths = svgElement(document, "g", { class: "process-flow-edges" });
    const labels = svgElement(document, "g", { class: "process-flow-edge-labels" });
    for (const edge of layout.edges) {
        paths.appendChild(svgElement(document, "path", {
            class: "process-flow-edge", d: edge.path, fill: "none", stroke: options.accent,
            "stroke-width": 1.8, "marker-end": `url(#${options.markerId})`,
            "data-edge-id": edge.id, "data-source": edge.source, "data-target": edge.target
        }));
        const group = svgElement(document, "g", {
            class: "process-flow-edge-label", transform: `translate(${edge.labelX},${edge.labelY})`
        });
        group.appendChild(svgElement(document, "rect", {
            x: -edge.labelWidth / 2, y: -edge.labelHeight / 2,
            width: edge.labelWidth, height: edge.labelHeight, rx: 4
        }));
        const value = svgElement(document, "text", {
            class: "process-flow-value", "text-anchor": "middle", y: edge.labelText ? -3 : 4
        });
        value.textContent = edge.valueText;
        group.appendChild(value);
        if (edge.labelText) {
            const label = svgElement(document, "text", { class: "process-flow-label", "text-anchor": "middle", y: 12 });
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
            width: node.width, height: node.height, rx: 7, stroke: options.accent, "stroke-width": 1.6
        }));
        const text = svgElement(document, "text", { "text-anchor": "middle", class: "process-flow-node-title" });
        node.lines.forEach((line, index) => {
            const span = svgElement(document, "tspan", { x: node.width / 2, y: 25 + index * 17 });
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

    const zoom = options.zoom ?? createZoomState();
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
    container.appendChild(toolbar);

    const viewportSize = (): { width: number; height: number } => ({
        width: viewport.clientWidth || options.width,
        height: viewport.clientHeight || Math.max(1, options.height - (summary.offsetHeight || 28) - 42 - result.warnings.length * 44)
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
