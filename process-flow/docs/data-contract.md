# Data contract and duplicate policy

The original eight roles plus optional `Flow Group` and their types are documented in
[the sample schema](../../example_data/README.md). Assign at most one field to
each role. Source, Target, and Value are required; the parser validates this at
runtime. Mapping conditions only constrain the maximum field count, so incomplete
assignments can reach the visual and receive a readable message. Microsoft allows
only one role with a positive minimum per mapping condition.

The visual uses `DataView.table`, reads columns by role (not by position), and
retains each received row as a separate directed edge. It never aggregates Value,
converts its sign, merges parallel edges, or combines different Tooltip IDs.

Power BI may group identical categorical combinations and aggregate Value before
the visual receives data. Bind a unique Tooltip ID for every input connection to
preserve its grain, including parallel connections. The visual cannot recover rows
already grouped by the host. Verify the chosen measure/aggregation against a
built-in table in the report. Do not assume the imported CSV row count is always
the received row count.

See Microsoft's [data view mapping documentation](https://learn.microsoft.com/en-us/power-bi/developer/visuals/dataview-mappings).

- Node IDs are the original, non-empty text values; whitespace is not trimmed from
  valid IDs. `A` and ` A` are different nodes. Numeric IDs must be converted to text
  in the semantic model.
- Blank/null IDs and non-numeric, null, NaN, or infinite Values cause that row to
  be skipped. A visible warning reports the skipped count. Zero is valid.
- Metadata belongs to Source. Target-only nodes use their ID as their title.
  Conflicting non-empty titles/descriptions use the lexicographically smallest
  value (UTF-16 order), independent of input row order, with a visible warning.
- Each edge ID encodes its endpoints, numeric value, optional Tooltip ID, Label,
  Group, and an occurrence number. It is distinct from its endpoint pair. Identical
  received rows remain separate; their occurrence numbers are local to the update.
  The input row index is retained for future host identity integration.
- Repeated Tooltip IDs remain separate edges and produce a warning. They are not
  suitable for the one side of a 1:* detail-table relationship.
- Cycles, self-loops, branches, merges, and disconnected components are valid.
- Empty filters and missing fields produce instructions rather than exceptions.
- M02 accepts at most 1,000 edges and 500 nodes. The host query requests up to 1,001
  rows so overflow is detectable. Segmented results or over-limit graphs display
  an explicit error instead of silently presenting an incomplete graph. Automatic
  incremental fetching is outside this milestone.

## Baseline sample

The checked-in fixture has eight nodes (`A`–`H`), nine edges, nine unique Tooltip
IDs, and only finite negative values. Its branches are B → C/D and E → F/G; its
merges are C/D → E and F/G → H. Node H is target-only and uses its ID.

M3A appends optional `Flow Group` without changing the original columns. Source
membership is independent from edge `Group`. Blank values are ungrouped; names
are trimmed; conflicting Source assignments leave the node ungrouped with a
warning. Membership is resolved only from valid received Source rows. See
[Flow Groups](flow-groups.md) for layout and report-upgrade details.
