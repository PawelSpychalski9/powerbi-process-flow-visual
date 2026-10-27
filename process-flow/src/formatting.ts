import powerbi from "powerbi-visuals-api";

export interface GraphSettings {
    nodeUseTheme: boolean;
    nodeFill: string;
    nodeBorder: string;
    nodeBorderWidth: number;
    edgeUseTheme: boolean;
    edgeColor: string;
    edgeWidth: number;
    orthogonalEdges: boolean;
    fontSize: number;
    automaticValues: boolean;
    decimalPlaces: number;
    thousandsSeparator: boolean;
    horizontalSpacing: number;
    verticalSpacing: number;
    canvasUseTheme: boolean;
    background: string;
    textColor: string;
    flowGroupUseTheme: boolean;
    flowGroupShowBackground: boolean;
    flowGroupBackground: string;
    flowGroupOpacity: number;
    flowGroupBorder: string;
    flowGroupBorderWidth: number;
    flowGroupRadius: number;
    flowGroupPadding: number;
    flowGroupTitleSize: number;
    flowGroupTitleColor: string;
}

type Definition = {
    key: keyof GraphSettings;
    property: string;
    label: string;
} & ({ kind: "color"; fallback: string } | { kind: "boolean"; fallback: boolean } |
    { kind: "number"; fallback: number; min: number; max: number; integer?: boolean });

export const formattingCards: { name: string; label: string; settings: Definition[] }[] = [
    { name: "nodes", label: "Nodes", settings: [
        { key: "nodeUseTheme", property: "useTheme", label: "Use theme colors", kind: "boolean", fallback: true },
        { key: "nodeFill", property: "fill", label: "Fill color", kind: "color", fallback: "#ffffff" },
        { key: "nodeBorder", property: "border", label: "Border color", kind: "color", fallback: "#1670a5" },
        { key: "nodeBorderWidth", property: "borderWidth", label: "Border width", kind: "number", fallback: 1.6, min: 0, max: 6 }
    ] },
    { name: "edges", label: "Connections", settings: [
        { key: "edgeUseTheme", property: "useTheme", label: "Use theme color", kind: "boolean", fallback: true },
        { key: "edgeColor", property: "color", label: "Color", kind: "color", fallback: "#1670a5" },
        { key: "edgeWidth", property: "width", label: "Line width", kind: "number", fallback: 1.8, min: 0.5, max: 6 },
        { key: "orthogonalEdges", property: "rightAngles", label: "Right-angle connections", kind: "boolean", fallback: false }
    ] },
    { name: "labels", label: "Labels and values", settings: [
        { key: "fontSize", property: "fontSize", label: "Font size", kind: "number", fallback: 13, min: 10, max: 24, integer: true },
        { key: "automaticValues", property: "automaticValues", label: "Automatic number precision", kind: "boolean", fallback: true },
        { key: "decimalPlaces", property: "decimalPlaces", label: "Decimal places", kind: "number", fallback: 2, min: 0, max: 8, integer: true },
        { key: "thousandsSeparator", property: "thousandsSeparator", label: "Thousands separator", kind: "boolean", fallback: true }
    ] },
    { name: "layout", label: "Spacing", settings: [
        { key: "horizontalSpacing", property: "horizontalSpacing", label: "Horizontal spacing", kind: "number", fallback: 180, min: 180, max: 500, integer: true },
        { key: "verticalSpacing", property: "verticalSpacing", label: "Vertical spacing", kind: "number", fallback: 76, min: 40, max: 300, integer: true }
    ] },
    { name: "canvas", label: "Canvas", settings: [
        { key: "canvasUseTheme", property: "useTheme", label: "Use theme colors", kind: "boolean", fallback: true },
        { key: "background", property: "background", label: "Background color", kind: "color", fallback: "#ffffff" },
        { key: "textColor", property: "textColor", label: "Text color", kind: "color", fallback: "#242424" }
    ] },
    { name: "flowGroups", label: "Flow Groups", settings: [
        { key: "flowGroupUseTheme", property: "useTheme", label: "Use theme colors", kind: "boolean", fallback: true },
        { key: "flowGroupShowBackground", property: "showBackground", label: "Show container backgrounds", kind: "boolean", fallback: true },
        { key: "flowGroupBackground", property: "background", label: "Background color", kind: "color", fallback: "#1670a5" },
        { key: "flowGroupOpacity", property: "opacity", label: "Background opacity (%)", kind: "number", fallback: 8, min: 0, max: 100, integer: true },
        { key: "flowGroupBorder", property: "border", label: "Border color", kind: "color", fallback: "#1670a5" },
        { key: "flowGroupBorderWidth", property: "borderWidth", label: "Border width", kind: "number", fallback: 1.5, min: 0, max: 6 },
        { key: "flowGroupRadius", property: "radius", label: "Corner radius", kind: "number", fallback: 8, min: 0, max: 40 },
        { key: "flowGroupPadding", property: "padding", label: "Container padding", kind: "number", fallback: 24, min: 8, max: 100, integer: true },
        { key: "flowGroupTitleSize", property: "titleSize", label: "Title font size", kind: "number", fallback: 14, min: 10, max: 30, integer: true },
        { key: "flowGroupTitleColor", property: "titleColor", label: "Title color", kind: "color", fallback: "#242424" }
    ] }
];

/** Treat report metadata as untrusted, including values outside Format pane limits. */
export function readSettings(objects?: powerbi.DataViewObjects): GraphSettings {
    const values: Record<string, string | number | boolean> = {};
    for (const card of formattingCards) {
        for (const definition of card.settings) {
            const raw = objects?.[card.name]?.[definition.property];
            let value: string | number | boolean = definition.fallback;
            if (definition.kind === "number" && typeof raw === "number" && Number.isFinite(raw)) {
                value = Math.max(definition.min, Math.min(definition.max, definition.integer ? Math.round(raw) : raw));
            } else if (definition.kind === "boolean" && typeof raw === "boolean") {
                value = raw;
            } else if (definition.kind === "color" && raw && typeof raw === "object" && "solid" in raw) {
                const color = (raw as powerbi.Fill).solid?.color;
                if (typeof color === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) value = color;
            }
            values[definition.key] = value;
        }
    }
    return values as unknown as GraphSettings;
}

export interface Appearance {
    foreground: string;
    background: string;
    nodeFill: string;
    nodeBorder: string;
    edgeColor: string;
    active: string;
    highContrast: boolean;
    groupBackground: string;
    groupBorder: string;
    groupTitle: string;
}

export function resolveAppearance(settings: GraphSettings, palette?: powerbi.extensibility.ISandboxExtendedColorPalette, accent = "#1670a5"): Appearance {
    const foreground = palette?.foreground?.value ?? "#242424";
    const background = palette?.background?.value ?? "#ffffff";
    if (palette?.isHighContrast) {
        return { foreground, background, nodeFill: background, nodeBorder: foreground, edgeColor: foreground,
            active: palette.foregroundSelected?.value ?? foreground, highContrast: true,
            groupBackground: background, groupBorder: foreground, groupTitle: foreground };
    }
    return {
        foreground: settings.canvasUseTheme ? foreground : settings.textColor,
        background: settings.canvasUseTheme ? background : settings.background,
        nodeFill: settings.nodeUseTheme ? background : settings.nodeFill,
        nodeBorder: settings.nodeUseTheme ? accent : settings.nodeBorder,
        edgeColor: settings.edgeUseTheme ? accent : settings.edgeColor,
        active: accent, highContrast: false,
        groupBackground: settings.flowGroupUseTheme ? accent : settings.flowGroupBackground,
        groupBorder: settings.flowGroupUseTheme ? accent : settings.flowGroupBorder,
        groupTitle: settings.flowGroupUseTheme ? foreground : settings.flowGroupTitleColor
    };
}

/** Native API formatting model; descriptors exactly match capabilities object properties. */
export function buildFormattingModel(settings: GraphSettings, highContrast = false): powerbi.visuals.FormattingModel {
    return { cards: formattingCards.map(card => ({
        uid: `${card.name}-card`, displayName: card.label,
        groups: [{ uid: `${card.name}-group`, displayName: card.label, slices: card.settings.map(definition => {
            const descriptor = { objectName: card.name, propertyName: definition.property };
            const common = { uid: `${card.name}-${definition.property}`, displayName: definition.label };
            const value = settings[definition.key];
            const colorDisabled = highContrast || (card.name === "nodes" && settings.nodeUseTheme) ||
                (card.name === "edges" && settings.edgeUseTheme) || (card.name === "canvas" && settings.canvasUseTheme) ||
                (card.name === "flowGroups" && settings.flowGroupUseTheme);
            if (definition.kind === "color") {
                return { ...common, disabled: colorDisabled, control: { type: powerbi.visuals.FormattingComponent.ColorPicker,
                    properties: { descriptor, value: { value: value as string } } } };
            }
            if (definition.kind === "boolean") {
                return { ...common, disabled: highContrast && definition.property === "useTheme",
                    control: { type: powerbi.visuals.FormattingComponent.ToggleSwitch, properties: { descriptor, value: value as boolean } } };
            }
            return { ...common, disabled: definition.key === "decimalPlaces" && settings.automaticValues,
                control: { type: powerbi.visuals.FormattingComponent.NumUpDown, properties: { descriptor, value: value as number,
                    options: { minValue: { type: powerbi.visuals.ValidatorType.Min, value: definition.min },
                        maxValue: { type: powerbi.visuals.ValidatorType.Max, value: definition.max } } } } };
        }) }],
        revertToDefaultDescriptors: card.settings.map(definition => ({ objectName: card.name, propertyName: definition.property }))
    })) };
}
