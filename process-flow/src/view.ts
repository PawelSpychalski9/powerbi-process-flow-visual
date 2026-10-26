import powerbi from "powerbi-visuals-api";
import { parseGraph, GraphResult } from "./graph";
import { createZoomState, renderGraph } from "./renderer";

/** Host lifecycle kept separate from the stylesheet entry point for DOM tests. */
export class ProcessFlowView implements powerbi.extensibility.visual.IVisual {
    private static nextInstance = 0;
    private readonly markerId = "process-flow-arrow-" + ProcessFlowView.nextInstance++;
    private readonly container: HTMLDivElement;
    private result: GraphResult = parseGraph();
    private readonly zoom = createZoomState();

    constructor(private readonly options: powerbi.extensibility.visual.VisualConstructorOptions) {
        this.container = options.element.ownerDocument.createElement("div");
        options.element.appendChild(this.container);
    }

    public update(options: powerbi.extensibility.visual.VisualUpdateOptions): void {
        this.options.host.eventService.renderingStarted(options);
        try {
            if (options.dataViews?.length || (options.type & powerbi.VisualUpdateType.Data)) {
                this.result = parseGraph(options.dataViews?.[0]);
            }
            renderGraph(this.container, this.result, {
                width: options.viewport.width,
                height: options.viewport.height,
                accent: this.options.host.colorPalette.getColor("process-flow").value,
                markerId: this.markerId,
                locale: this.options.host.locale,
                zoom: this.zoom
            });
            this.options.host.eventService.renderingFinished(options);
        } catch {
            this.container.replaceChildren();
            this.container.setAttribute("role", "alert");
            this.container.textContent = "Unable to display this process graph. Check the assigned fields and filter the data.";
            this.options.host.eventService.renderingFailed(options, "Unable to render process graph.");
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return { cards: [] };
    }

    public destroy(): void {
        this.container.remove();
    }
}
