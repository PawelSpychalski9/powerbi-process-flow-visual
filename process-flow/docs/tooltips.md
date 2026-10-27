# Edge tooltips and related details (M04)

Hover an edge line or its value/label badge with a mouse or pen. The visual calls
the Power BI tooltip service with Source, Target, signed Value, and any available
Label, Group, and Tooltip ID. Tooltip text is complete even when the graph label
is shortened. Tooltip values retain numeric precision independently of the
graph's display rounding. Tooltips hide when leaving the edge, scrolling,
changing zoom, updating data, or destroying the visual.

Power BI renders the tooltip. The visual does not fetch detail rows, choose a
tooltip page from an ID, or draw an HTML imitation of a report tooltip. The
report author configures the page. Both native and report-page support are
declared, with Tooltip ID as the tooltip binding role.

## Default tooltip check

1. Build with `npm.cmd run package` inside `process-flow/`. Import the generated
   `.pbiviz` from `dist/` into Power BI, replacing the existing visual if prompted.
2. Load `example_data/example_data.csv`. Assign Source, Target, Value and
   Tooltip ID to their matching roles; assign Label and Group to see those items.
3. In the visual's Format pane, enable General > Tooltips. Select the default
   tooltip type rather than a report page for this check (UI wording can vary).
4. Hover the line and label for B -> C. Expect Source B, Target C, Value -18,
   Tooltip ID T002, and the sample Label and Group. B -> D must show -5 and T003.
5. Check zoom, Fit, scrolling, smooth and right-angle lines, resizing, refresh,
   and two visual instances on one page. Tooltip positions should follow the
   pointer and old content should disappear. Remove the optional roles and check
   that Source, Target and Value still appear. Turning tooltips off in Power BI
   should suppress them.

## Example relationship

`example_data/FlowDetails.csv` is synthetic demonstration data. Import it as
**FlowDetails** and use the main edge table as **ProcessFlow** (rename the imported
`example_data` table or substitute that name in the instructions).

- Both Tooltip ID columns: Text.
- ProcessFlow Value and FlowDetails Amount: numeric.
- Create an active `ProcessFlow[Tooltip ID] (1) -> (*) FlowDetails[Tooltip ID]`
  relationship, with single-direction filtering from ProcessFlow to FlowDetails.
- This relationship requires unique populated Tooltip IDs on the ProcessFlow
  side. The sample has nine unique keys. Check uniqueness and blanks in your own
  data before selecting the relationship cardinality.

Do not create this 1:* relationship when main-table keys repeat. The visual keeps
received duplicate edges and warns about repeated keys. Distinct row identities
do not make a shared business key unique: related detail records with that key
remain shared. Use unique edge keys, or design and validate a separate distinct
key/bridge model; this milestone does not implement a bridge workaround. Also,
Power BI can group identical source rows before delivering the visual's data.

## Configure a report-page tooltip

1. Add a report page named **Edge details**. In page Format settings, set Canvas
   settings > Type to **Tooltip** and enable Page information > Allow use as
   tooltip (older Power BI versions call this option Tooltip).
2. Add **ProcessFlow[Tooltip ID]** to this page's Tooltip fields. Keep all filters
   enabled when that setting is available. Use the same main-table column that
   is assigned to the process visual's Tooltip ID role.
3. Add a built-in table with FlowDetails Detail ID, Description and Amount; set
   Amount to Don't summarize for individual detail rows. Add a card showing Sum
   of FlowDetails Amount if desired. Clear any test page filters on Tooltip ID.
4. Select the process visual on the main report page. In General > Tooltips,
   enable tooltips, choose **Report page**, then explicitly choose **Edge details**.
5. Hover B -> C: only D002 (Missing customer identifier, -10) and D003 (Invalid
   transaction date, -8) should appear. The optional sum card should show -18.
6. Hover B -> D: only D004 (Duplicate flagged for manual review, -3) and D005
   (Ambiguous record flagged for manual review, -2) should appear; sum -5.
7. Switch repeatedly between the two edges. Confirm no unrelated detail IDs
   remain. Test both line and label hover, zoom/Fit, refresh, and the published
   report in Power BI Service if your tenant permits custom visuals.

If every edge shows all details, check the active relationship direction, matching
Text keys, role assignment, selected tooltip page, and page filters. A card that
only echoes Tooltip ID is insufficient proof: verify the actual detail rows.
The relationship supplies model filtering; it does not cause TypeScript to query
the detail table. Tooltip ID does not dynamically select different report pages.

## Identity and validation limits

The visual uses the installed API's `withTable(table, originalRowIndex)` to build
an identity from the host's row identity. Parsing and layout sorting never change
that index. Show and move calls carry the identity for the hovered edge. If the
host supplies no row identity, native data items still work, but report-page
filtering cannot be guaranteed; no identity is invented from a text key.

Automated tests exercise payloads, row indexes, duplicates, missing identities,
hover transitions, cleanup and browser hit areas using a mock host. These tests
cannot prove Power BI's semantic-model filtering. The two-edge check above must
be completed in Power BI Desktop and, when applicable, Service before declaring
end-to-end acceptance. Touch long-press and keyboard tooltip activation are not
implemented in this milestone. Node tooltips and selection/cross-filter actions
are outside M04.

API references: [Power BI tooltip service and report-page support](https://learn.microsoft.com/en-us/power-bi/developer/visuals/add-tooltips),
[table selection identities](https://learn.microsoft.com/en-us/power-bi/developer/visuals/selection-api),
[report tooltip pages](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-tooltips).
