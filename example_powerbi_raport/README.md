# Updating the example Power BI report for Flow Groups

No `.pbix`, `.pbip`, `.pbir`, or `.tmdl` report/model artifact was present in this
checkout when M3A was implemented. This directory provides instructions only;
no report has been regenerated, modified, or visually verified automatically.

Use these steps on your existing report in Power BI Desktop. Keep its current
table, pages, relationships, visuals, and formatting.

1. Open the existing report and choose **Transform data**. Select the query that
   loads `example_data/example_data.csv`.
2. Check the Source step in Advanced Editor. If `Csv.Document` specifies
   `Columns=8`, change it to `Columns=9` (or remove the fixed Columns option).
   Keep the existing file path and other query transformations.
3. After Promote Headers, add `{"Flow Group", type text}` to the existing
   `Table.TransformColumnTypes` list. If another step explicitly selects or
   reorders columns, include `Flow Group` there too. Do not recreate the table or
   change its name, keys, relationships, or existing data types.
4. Refresh the query preview. It should show the original eight columns followed
   by Flow Group, still with nine rows. Click **Close & Apply**.
5. Import the rebuilt `.pbiviz` from `process-flow/dist/` and replace the existing
   custom visual. Keep its existing GUID and role assignments.
6. Drag the new Text column **Flow Group** into the visual's **Flow Group** well.
   Keep the original **Group** column assigned to **Group**. Existing reports
   without the new role continue to render their original, ungrouped graph.
7. Check for two containers, Processing (B/C/D) and Output (E/F/G), with A and H
   outside. The summary remains eight nodes and nine connections. Confirm
   B → C = -18 and that cross-container arrows still end at their actual nodes.
8. Open **Format visual → Flow Groups**. Test background visibility, opacity,
   border, radius, padding, and title settings. Disable Use theme colors before
   editing custom colors. Test Fit, zoom, resizing, and the existing format cards.
9. Save a copy, reopen it, and verify all pages, filters, relationships, formatting,
   and field bindings remain intact. Desktop verification remains manual.

For reference, a CSV Source step for the new schema uses:

```powerquery
Csv.Document(
    File.Contents(CsvPath),
    [Delimiter = ",", Columns = 9, Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
)
```

`CsvPath` represents your existing file-path parameter/expression. Extend the
existing type conversion with `{"Flow Group", type text}` rather than replacing
the complete query. If your source is not a CSV query, add the optional text field
to that source/model and assign it to the new role; no other field is mandatory.
