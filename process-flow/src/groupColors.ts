import powerbi from "powerbi-visuals-api";
import type { GraphNode } from "./graph";
import type { Appearance } from "./formatting";

export interface GroupColors {
    name: string;
    key: string;
    inherit: boolean;
    background: string;
    border: string;
    titleColor: string;
}

/** Named instances remain stable when table rows are sorted, filtered or replaced. */
export function groupColorKey(name: string): string {
    return `flowGroup:${JSON.stringify(name)}`;
}

function color(raw: powerbi.DataViewPropertyValue | undefined, fallback: string): string {
    const value = raw && typeof raw === "object" && "solid" in raw ? (raw as powerbi.Fill).solid?.color : undefined;
    return typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : fallback;
}

export function readGroupColors(nodes: GraphNode[], objects: powerbi.DataViewObjects | undefined, appearance: Appearance): GroupColors[] {
    const names = [...new Set(nodes.flatMap(node => node.flowGroup ? [node.flowGroup] : []))].sort();
    const instances = objects?.flowGroups?.$instances;
    return names.map(name => {
        const key = groupColorKey(name);
        const saved = instances && Object.prototype.hasOwnProperty.call(instances, key) ? instances[key] : undefined;
        return { name, key, inherit: saved?.useTheme !== false,
            background: color(saved?.background, appearance.groupBackground),
            border: color(saved?.border, appearance.groupBorder),
            titleColor: color(saved?.titleColor, appearance.groupTitle) };
    });
}

export function addGroupColorFormatting(model: powerbi.visuals.FormattingModel, colors: GroupColors[], highContrast: boolean): void {
    const card = model.cards.find((card): card is powerbi.visuals.FormattingCard => "uid" in card && card.uid === "flowGroups-card");
    if (!card) return;
    for (const group of colors) {
        const descriptor = (propertyName: string): powerbi.visuals.FormattingDescriptor =>
            ({ objectName: "flowGroups", propertyName, selector: { id: group.key } });
        const slices: powerbi.visuals.FormattingSlice[] = [{
            uid: `${group.key}-inherit`, displayName: "Use shared colors", disabled: highContrast,
            control: { type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                properties: { descriptor: descriptor("useTheme"), value: group.inherit } }
        }];
        for (const [property, label] of [["background", "Background color"], ["border", "Border color"], ["titleColor", "Title color"]] as const) {
            slices.push({ uid: `${group.key}-${property}`, displayName: label, disabled: highContrast || group.inherit,
                control: { type: powerbi.visuals.FormattingComponent.ColorPicker,
                    properties: { descriptor: descriptor(property), value: { value: group[property] } } } });
        }
        card.groups.push({ uid: `${group.key}-group`, displayName: group.name, slices });
        card.revertToDefaultDescriptors?.push(...["useTheme", "background", "border", "titleColor"].map(descriptor));
    }
}
