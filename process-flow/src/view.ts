import powerbi from "powerbi-visuals-api";
import { parseGraph, GraphResult } from "./graph";
import { createZoomState, renderGraph } from "./renderer";
import { buildFormattingModel, readSettings, resolveAppearance } from "./formatting";
import { bindEdgeTooltips, edgeIdentities } from "./tooltips";
import { GraphInteractions } from "./interactions";

/** Host lifecycle kept separate from the stylesheet entry point for DOM tests. */
export class ProcessFlowView implements powerbi.extensibility.visual.IVisual {
    private static nextInstance = 0;
    private readonly markerId = "process-flow-arrow-" + ProcessFlowView.nextInstance++;
    private readonly container: HTMLDivElement;
    private result: GraphResult = parseGraph();
    private readonly zoom = createZoomState();
    private dataView?: powerbi.DataView;
    private settings = readSettings();
    private disposeTooltips: () => void = () => undefined;
    private readonly interactions: GraphInteractions;

    constructor(private readonly options: powerbi.extensibility.visual.VisualConstructorOptions) {
        this.container = options.element.ownerDocument.createElement("div");
        options.element.appendChild(this.container);
        this.interactions = new GraphInteractions(this.container, options.host.createSelectionManager?.());
    }

    public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        this.disposeTooltips();
        this.options.host.eventService.renderingStarted(options);
        try {
            if (options.type & powerbi.VisualUpdateType.Data) {
                this.dataView = options.dataViews?.[0];
                this.result = parseGraph(this.dataView);
            } else if (options.dataViews?.[0]) {
                const incoming = options.dataViews[0];
                this.dataView = { ...this.dataView, ...incoming,
                    metadata: { ...this.dataView?.metadata, ...incoming.metadata },
                    table: incoming.table ?? this.dataView?.table };
                this.result = parseGraph(this.dataView);
            }
            this.settings = readSettings(this.dataView?.metadata.objects);
            const accent = this.options.host.colorPalette.getColor("process-flow").value;
            renderGraph(this.container, this.result, {
                width: options.viewport.width,
                height: options.viewport.height,
                accent,
                markerId: this.markerId,
                locale: this.options.host.locale,
                zoom: this.zoom,
                settings: this.settings,
                appearance: resolveAppearance(this.settings, this.options.host.colorPalette, accent),
                allowInteractions: this.options.host.hostCapabilities?.allowInteractions !== false
            });
            const identities = edgeIdentities(this.options.host, this.dataView?.table, this.result.edges);
            this.disposeTooltips = bindEdgeTooltips(this.container, this.options.host.tooltipService,
                this.result.edges, identities, this.options.host.locale);
            this.interactions.update(this.result.edges, identities, this.options.host.hostCapabilities?.allowInteractions !== false);
            this.options.host.eventService.renderingFinished(options);
        } catch {
            this.container.replaceChildren();
            this.container.setAttribute("role", "alert");
            this.container.textContent = "Unable to display this process graph. Check the assigned fields and filter the data.";
            this.options.host.eventService.renderingFailed(options, "Unable to render process graph.");
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return buildFormattingModel(this.settings, this.options.host.colorPalette.isHighContrast);
    }

    public destroy(): void {
        this.disposeTooltips();
        this.interactions.destroy();
        this.container.remove();
    }
}
