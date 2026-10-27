# Report interactions (M05)

## Selection behavior

- Click an edge's line, wide invisible hit area, or label to select the same
  original table row through Power BI's Selection Manager.
- Ctrl-click (or Command-click) adds/removes selections. Clicking an already
  selected edge again uses the host's toggle behavior.
- Click blank graph space or a Flow Group background to clear selection.
  Scrolling, zoom/Fit controls and clicking the summary preserve selection.
- Click a node to select the union of its visible incoming and outgoing edge
  rows. This includes target-only nodes. A self-loop is included once. Ctrl-click
  also works on these sets according to the host's multi-selection behavior.
- Selected connections and their endpoints use the theme's active color and a
  dashed outline; other marks are dimmed. High contrast uses the host's selected
  foreground color. Selection survives zoom, resize and formatting updates.

Nodes do not have an independent model identity in the current edge table. Node
selection means **incident rows currently delivered to the visual**, not a filter
over a separate node dimension or every occurrence of that node across the model.
It does not automatically expand beyond the current report filters/data limit.

Edge identities use `withTable(table, originalRowIndex)`, shared with M04 tooltips.
Sorting, skipped invalid rows and parallel edges never substitute a layout index
for the source row index. Two rows sharing endpoints or Tooltip ID remain separate
when Power BI delivers separate row identities. Identical input records can be
grouped by Power BI before delivery, and duplicate business keys still share their
related detail rows. Missing host identities disable selection for those edges;
nodes require identities for all their incident rows to avoid partial selections.

## Context menu and host state

Right-click an edge line/label to request the native Power BI data-point context
menu with that row's identity. Right-click the background for the visual's general
menu. A node with exactly one distinct incident identity uses that identity; a
multi-row node uses the general menu because `showContextMenu` accepts one identity,
not an array. No arbitrary incident row is used as a node-wide context.

Available menu commands depend on Power BI, the fields, report permissions and
configuration. Include/Exclude commands can change the report's filtering.

One selection manager is retained per visual. Its restore callback updates the
display for host-driven selection changes, including restored bookmark state.
Identity inclusion matches compatible partial selections. Unknown/unrelated
identities do not dim the entire graph. Rapid asynchronous operations are
serialized; queued clicks from an obsolete render are discarded. Host failures
produce a recoverable status message. Destroy removes listeners and makes the
SDK callback inert (the installed API has no unregister callback method).

When `allowInteractions` is false, selection, deselection and native context-menu
requests are suppressed. M04 tooltips remain independently controlled by the host.

## Cross-filtering and highlighting constraints

The visual submits row selections; Power BI decides how other visuals respond
based on shared field identities, active relationships and Edit interactions.
`supportsMultiVisualSelection` is enabled and selection restore/update paths are
implemented. This declaration does not itself prove report-level filtering.

The current mapping is **table**. The installed API's `DataViewTable` has no
highlight-value array, and Microsoft explicitly states that table mapping does
not support the highlights feature. `supportsHighlight` remains unset. An external
selection can filter the graph to the rows the host supplies; it does not retain
an unfiltered graph with partial numeric highlights. This is separate from the
visual's local selected/dimmed styling. No highlight values or SDK properties are
invented, and the data mapping is not migrated in this milestone.

## Manual Power BI acceptance checklist

1. Run `npm.cmd run package` inside `process-flow/` and reimport the `.pbiviz`
   from `dist/`. Assign the sample Source, Target, Value and Tooltip ID fields.
2. On the same report page, add a built-in table using Source, Target, Tooltip ID
   and Value **from the same main edge table**. Add a bar chart with Tooltip ID
   and Value. Set Value to Sum if a measure is needed.
3. Use Format > Edit interactions and enable filtering/highlighting from the
   process visual to these companions; enable **Filter** in the reverse direction.
   Also test a related FlowDetails table using M04's active 1:* relationship.
4. Click B -> C (line and label separately): expect the T002 row, Value -18, in
   the companion table and its D002/D003 detail rows. Ctrl-click B -> D: expect
   both T002 and T003, and D002/D003/D004/D005. Ctrl-click B -> C again: only T003
   should remain. Verify duplicate endpoints with different keys individually.
5. Click blank graph space: all nine sample edges and all companion rows should
   return. Repeat after zooming/Fit, scrolling, resizing and changing formatting;
   controls themselves must not clear the selection.
6. Click node B: expect T001, T002 and T003 (incoming A -> B plus outgoing B -> C/D).
   Click target-only H: expect T008/T009. Clear selection on the background.
7. Right-click B -> C: expect the Power BI data-point menu. Right-click blank
   space or multi-row node B: expect the general menu, with no arbitrary edge
   identity. Confirm normal browser context-menu handling does not replace the
   host menu when interaction is enabled.
8. Select T002 in the companion table/bar chart. With the reverse interaction
   set to Filter, expect only the graph rows supplied by Power BI. Clear the
   companion selection and confirm the full graph returns. Do not expect partial
   highlight values with the current table mapping.
9. Save a bookmark with a graph selection, change/clear the selection, then
   restore the bookmark. Check selected styling and companion data. Test Ctrl
   selections across different visuals, plus two process visual instances, to
   validate host multi-visual behavior in this report.
10. Repeat the key checks in the published report when permitted by your tenant.
    Check high contrast: selected outlines should remain distinct without relying
    only on color. Tooltip contents must still follow the hovered edge.

Automated DOM tests and a real-browser pointer test use an SDK-shaped mock host.
They cover API arguments, row indexes, single/multi/node selection, clear,
restore, context menus, permissions, asynchronous failures, and cleanup. They
cannot validate actual semantic-model propagation, report interactions or saved
Power BI bookmarks. Those acceptance checks remain pending until run in Power BI.
Keyboard navigation is M06; it is not declared implemented here.

References: [selection API](https://learn.microsoft.com/en-us/power-bi/developer/visuals/selection-api),
[context menus](https://learn.microsoft.com/en-us/power-bi/developer/visuals/context-menu),
[highlight limitations](https://learn.microsoft.com/en-us/power-bi/developer/visuals/highlight),
[multiple visual selection](https://learn.microsoft.com/en-us/power-bi/developer/visuals/supportsmultivisualselection-feature).
