# M3A — Flow Groups (compound nodes)

Assign the optional Text field **Flow Group** to enclose Source nodes in larger
titled rectangles. Edges continue to connect individual nodes. The existing
**Group** field still categorizes edges; it never assigns node membership.

## Membership and compatibility

- Non-empty group names are trimmed. One container is created for each distinct
  resulting name. Names are case-sensitive and internal whitespace is preserved.
- Null, empty, or whitespace-only assignments mean ungrouped. Target-only nodes
  remain ungrouped unless a valid Source row for that ID provides membership.
- All valid Source rows must agree, including whether a node is ungrouped.
  Conflicting names or a mix of blank and named assignments leave the node outside
  all containers and produce a visible warning identifying the node. Non-text
  values also produce a warning and are treated as blank. No edges are discarded
  or aggregated by this policy.
- Membership is resolved from the rows received after host aggregation/filtering.
  The visual cannot infer hidden or filtered-out metadata. Keep Source metadata
  consistent in the semantic model and bind unique Tooltip IDs to preserve grain.
- Without any resolved group memberships, the original flat layout function is
  used unchanged. Existing field bindings, values, edge categories, format settings,
  zoom behavior, and the visual GUID are preserved. No new field is mandatory.

## Layout

The existing code uses its own iterative strongly-connected-component/longest-path
layout, not a third-party graph library. M3A reuses it twice: first inside each
group, then for a graph whose blocks are groups and ungrouped nodes. Block columns
expand to their actual widths/heights, keeping containers and unrelated nodes
separate even for disconnected graphs and cyclic group relationships.

Padding, the title band, local edge labels, self-loop routes, and node dimensions
contribute to container size. Titles are shortened if necessary and their full
names remain in accessible labels. Containers are drawn behind all edges and
nodes in the same SVG, so zoom and Fit include them automatically.

Adjacent blocks connect through inter-column corridors when their endpoint nodes
are on the outward-facing sides. Other crossings use inner column gaps and exterior
roads, with label lanes above the blocks. Connections keep actual node endpoints;
groups never replace those endpoints. Internal routes reuse the original layout.
Cycles and self-loops terminate without recursive traversal. No dependencies were
added and no SDK/tool versions were changed.

This is not a general obstacle-avoiding optimizer. Dense graphs can still have
crossing lines or overlapping internal labels. Interleaved memberships, group
cycles, or edges leaving interior nodes can create long exterior routes and a
larger canvas. Fit may make such graphs small; zoom and scroll to inspect them.
Nested groups, collapse/expand, dragging, and report-selection behaviors are not
part of M3A. Existing 1,000-edge/500-node limits remain in force.

## Flow Groups format card

- **Use theme colors:** enabled by default; disable it for custom colors.
- **Show container backgrounds:** hides fills only, retaining titles and borders.
- **Background color / opacity:** default theme accent at 8% opacity.
- **Border color / width:** default theme accent, 1.5 px; range 0–6 px.
- **Corner radius:** default 8 px; range 0–40 px.
- **Container padding:** default 24 px; range 8–100 px, in addition to the local
  layout's spacing and the separate title band.
- **Title font size / color:** default 14 px and theme foreground; range 10–30 px.

In high contrast, colors come from the host foreground/background, group outlines
are at least 2 px, and visible fills are opaque background color. Custom color
values remain saved and are restored when high contrast is disabled. Reset-to-
default descriptors cover all group properties. Hiding backgrounds does not alter
membership or geometry. Disabled host interactions retain the existing static Fit.

## Sample and Desktop verification

The CSV now has nine columns but still eight nodes and nine edges. **Processing**
contains B/C/D; **Output** contains E/F/G; A and target-only H stay outside.
Internal, cross-group, and grouped/ungrouped edges are all represented.

1. Follow [the report upgrade steps](../../example_powerbi_raport/README.md) to
   refresh the query schema, replace the `.pbiviz`, and bind Flow Group.
2. Verify the two containers, titles, and membership above. Check B → C = -18,
   C/D → E crossing between groups, and A → B and F/G → H crossing group boundaries.
3. Test every Flow Groups setting, including hidden backgrounds, custom colors,
   title size, padding, and Reset to default. Existing M03 cards must still work.
4. Click Fit, resize, then zoom and scroll. Rectangles and titles should scale with
   their nodes and remain within the fitted canvas.
5. Remove Flow Group from the field well. Confirm the original ungrouped layout
   returns, with no containers and no changes to signed values or edge Group.
6. In a disposable table, try all-blank groups, one group, disconnected groups,
   cycles, self-loops, parallel edges, and conflicting Source memberships. Verify
   warnings and deterministic ungrouped handling for conflicts.
7. Check the host's high-contrast palette, save/reopen the report, and capture
   screenshots. Actual Power BI field-well, Format pane, and persistence checks
   require the report author; local DOM/browser checks are not Desktop validation.

## Local checks

Run `npm.cmd test`, `npm.cmd run test:browser`, `npm.cmd run lint`,
`npm.cmd run typecheck`, and `npm.cmd run package` inside `process-flow/`.
The existing browser checks now include group bounds in Fit, custom group styles,
and high-contrast groups. Generated preview HTML/PNG and `.pbiviz` outputs remain
ignored by Git. See [the sample schema](../../example_data/README.md).

## Implementation files

- `process-flow/src/graph.ts`: optional role, membership, and conflict policy.
- `process-flow/src/layout.ts` and new `process-flow/src/compoundLayout.ts`: flat
  fallback, block layout, container bounds, and boundary-crossing routes.
- `process-flow/src/renderer.ts`: group rectangles and titles behind graph content.
- `process-flow/src/formatting.ts` and `process-flow/capabilities.json`: the optional
  field, Flow Groups format card, and theme/high-contrast styling.
- `process-flow/tests/flow-groups.test.cjs` (new), `fixture.cjs`,
  `formatting.test.cjs`, `renderer.test.cjs`, and `browser-zoom.cjs`: fixtures,
  compatibility, parser/layout/rendering, format descriptors, and browser checks.
- `example_data/example_data.csv` and `example_data/README.md`: nine-column sample
  and updated field semantics.
- `README.md`, `process-flow/docs/data-contract.md`,
  `process-flow/docs/formatting.md`, and this guide: current behavior and validation.
- `example_powerbi_raport/README.md` (new): manual report/query upgrade instructions.
- `.gitignore`: restores exclusion of the existing local-only work directory.
