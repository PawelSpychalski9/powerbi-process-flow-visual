# M03 — Formatting and usability

M03 introduced five cards; M3A adds the sixth, **Flow Groups**. Settings are stored in
the visual's report metadata and are read on each host update. The native API
formatting model supplies stable property descriptors and reset-to-default
descriptors. The SDK/API versions and visual GUID are unchanged.

| Card | Settings | Defaults |
| --- | --- | --- |
| Nodes | Theme colors, fill, border color, border width | Theme enabled; 1.6 px border |
| Connections | Theme color, color, line width | Theme enabled; 1.8 px line |
| Labels and values | Font size, automatic number precision, decimal places, thousands separator | 13 px; automatic precision; grouping enabled |
| Spacing | Horizontal and vertical spacing | 180 px and 76 px |
| Canvas | Theme colors, background and text colors | Theme enabled |
| Flow Groups | Background visibility, theme/custom colors, opacity, border, corner radius, padding, title | Theme enabled; 8% background opacity; 24 px padding |

Disable the relevant **Use theme colors** switch to edit its custom colors.
Disable **Automatic number precision** to choose 0–8 decimal places. Formatting
uses the host locale, retains negative signs, and never changes the underlying
numeric values or arrow directions. This milestone does not interpret arbitrary
DAX format strings, currencies, or percentages; these controls format plain
numeric edge annotations. Exceptionally long numbers switch to scientific
notation so they remain within their label boxes.

Font size is limited to 10–24 px. Nodes and label boxes grow with the text.
Spacing controls define minimum gaps: the layout expands them further when
necessary to accommodate larger labels. Long text is still shortened; dense
graphs can still have crossings. Limits remain 1,000 edges and 500 nodes.

## Theme, contrast, and permissions

With theme switches enabled, the visual uses the host palette's foreground,
background, and a stable accent. Theme changes are applied on subsequent host
updates. In high contrast, all custom color overrides are ignored: foreground is
used for text, outlines, edges, and arrows; background fills nodes and label
boxes; the selected-foreground color marks the active Fit control. Outlines are
at least 2 px. Saved custom colors are preserved and become available again when
high contrast is disabled. Color editors and theme switches are disabled while
high contrast is active.

When `hostCapabilities.allowInteractions` is false, zoom controls are hidden,
the graph automatically fits its viewport, and keyboard/manual scrolling is
disabled. Restoring permissions restores the prior interactive zoom state.
This does not add report selections, cross-filtering, or host highlighting;
those remain in M05. No selection-support flags were added.

Missing roles display a landing message with required and optional field names.
Empty filters, invalid rows, incomplete data, and oversized graphs have readable
states. Invalid rows are counted in warnings. New valid data replaces the state
without retaining an old graph. The landing-page and empty-data capabilities
are enabled because these states are implemented.

## Manual acceptance in Power BI

Import the rebuilt `.pbiviz` from `process-flow/dist/`, replacing the previous
visual. Use the existing sample report or follow [the baseline checklist](validation.md).

1. **Before:** confirm the default sample still has eight nodes, nine edges, and
   B → C = -18. Check the previously accepted zoom/Fit controls.
2. Open **Format visual** and confirm the six cards listed above appear.
3. Under Nodes, disable Use theme colors, set a light fill and dark border, and
   change border width from 1.6 to 3. Verify the actual nodes change.
4. Under Connections, disable Use theme color, set a different color, and increase
   line width to 4. Verify edges and arrowheads have the same chosen color.
5. Set font size to 20. Verify node titles, IDs, edge values, and optional labels
   grow without overlapping on the sample. Turn off automatic number precision
   and choose two decimal places: B → C should show -18.00 (or the locale's decimal
   separator). Signs and arrow directions must remain unchanged.
6. Increase horizontal spacing to 300 and vertical spacing to 150. Verify the
   branches separate further. Click Fit, resize repeatedly, then zoom in and scroll.
7. Under Canvas, disable Use theme colors and set a different background and text
   color. Verify graph text, canvas, messages, and controls remain visible.
8. Use each card's reset button and reset all formatting. Verify defaults return.
   Save and reopen the report after applying custom settings: the host should
   restore them. Zoom remains session-local and is not a report formatting setting.
9. Re-enable the theme switches. Change the report theme and verify palette-based
   colors update. Test the host's high-contrast palette: text, fills, labels,
   arrows, and buttons should all use the contrast colors, regardless of custom
   settings. Check both dark and light high-contrast backgrounds where available.
10. Remove a required role, filter all rows out, and restore valid data. Verify
    instructions/empty states and recovery. Test null Values in a disposable
    fixture; warnings should report skipped rows without changing valid values.
11. Where a host mode exposes `allowInteractions: false`, verify there are no zoom
    controls and the whole graph fits. This flag is also covered by local tests;
    it is not an author-facing Format pane switch.
12. Capture before/after screenshots with the Format pane visible, plus a
    high-contrast screenshot. Report any differences from the standalone preview.

Local DOM/browser tests simulate host metadata, colors, and permissions. They
verify the resulting SVG, CSS, and geometry; they do not run Power BI's Format
pane, save/reopen a `.pbix`, or certify Desktop/Service integration. Final manual
acceptance remains with the report author.

## Local verification

Run from `process-flow/`:

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run package
```

The Chrome/Edge headless test additionally saves `.tmp/m03-custom.png`,
`.tmp/m03-high-contrast.png`, and `.tmp/m03-landing.png`. The interactive standalone
preview uses the same parser, native formatting model, renderer, and stylesheet.
All generated artifacts remain ignored by Git. No dependencies were added for M03.

The implementation follows the installed API 5.11.1 types and Microsoft's
[formatting model](https://learn.microsoft.com/en-us/power-bi/developer/visuals/format-pane-general),
[high-contrast](https://learn.microsoft.com/en-us/power-bi/developer/visuals/high-contrast-support),
and [interaction-permission](https://learn.microsoft.com/en-us/power-bi/developer/visuals/visuals-interactions)
documentation.
