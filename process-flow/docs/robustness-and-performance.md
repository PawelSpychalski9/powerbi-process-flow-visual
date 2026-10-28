# Robustness and performance (selected M06 work)

This increment covers difficult data, scale measurements, and error recovery.
Keyboard navigation, screen-reader improvements and the remaining accessibility
work are not included.

## Data handling and safety limits

| Input | Behavior |
|---|---|
| Missing required roles | Instructions to assign Source, Target, Value; no partial graph. |
| Empty/filtered-out data | Empty state; old SVG is removed. |
| Null/blank IDs or non-finite/non-numeric Value | Invalid rows skipped with a visible count; valid zero/negative values preserved. |
| Duplicate endpoints or Tooltip IDs | Received rows retained separately; repeated-key warning; no implicit aggregation. |
| Conflicting source metadata | Deterministic lexicographic title/description; warning. Conflicting Flow Groups remain ungrouped. |
| Cycles, self-loops, disconnected components | Bounded iterative layout; all received valid edges retained. |
| Long labels/titles | Bounded visible labels; original model IDs unchanged; edge tooltips retain full text. |
| Malformed host table/rows | Invalid table state or invalid-row count, rather than an unchecked parser exception. |
| More than 500 nodes or 1000 received rows | Entire graph rejected with instructions to filter; no misleading partial diagram. |
| Segmented/incomplete host result | Rejected as incomplete; filter the report. |
| Text cell over 4096 UTF-16 code units | Entire graph rejected; shorten source text. IDs are never truncated or merged. |
| More than 1,000,000 UTF-16 code units across assigned text cells | Entire graph rejected; filter or shorten source text. Repeated cell values count again. |

Row/node limits existed before this increment. Text budgets now bound the amount
of work done before metadata collection, string sorting, edge-key creation and
SVG label measurement. These are safety limits, not a promise that every graph at
the limit is readable or equally fast. Limits apply to the data Power BI delivers,
not the total size of a semantic model.

An unexpected update failure clears old interaction context and shows a message
with recovery steps. The next valid update can render again. Tooltip service
exceptions produce a temporary status message instead of escaping from pointer
handlers or blocking update/destroy. A successful subsequent hover clears that
message. Invalid host locale falls back to an unformatted signed numeric tooltip
value. Existing selection failures retain a recoverable status message.

## Repeatable profiling

From `process-flow/`, run:

```powershell
npm.cmd run profile
```

Chrome or Edge must be installed; set `PROCESS_FLOW_BROWSER_PATH` if it is not in
the locations used by `tests/browser-zoom.cjs`. The command generates:

- `.tmp/performance.json`: raw samples, medians, browser and hardware metadata.
- `.tmp/stress-data/*.csv`: synthetic importable fixtures for manual Power BI tests.

The profiler uses real SVG DOM, layout and interaction code in a headless browser
with a mock Power BI host. Each case runs one warm-up and five measured updates
at a 1000 x 600 viewport, default formatting and smooth edges. Reported values are
medians in milliseconds. Parse and layout are measured independently; full update
**already includes** parsing, layout, SVG rebuilding, identity/selection setup,
and a forced browser layout. Do not add the columns together. The JSON's frameMs
also waits for two animation frames; it is not a GPU paint measurement. Select-all
measures local styling through a host restore callback, not semantic-model work.

The fixtures include growing chains, a 500-node cycle, branches/merges, disconnected
pairs, parallel edges, 20 Flow Groups and long Unicode metadata. Regression tests
also check both smooth/right-angle geometry, determinism, finite coordinates,
edge/label bounds, missing fields, duplicate keys, self-loops and error recovery.
Timing values are not brittle CI pass/fail thresholds.

## Measured baseline

Local run on 2026-10-27: Windows, AMD Ryzen 7 5700U (16 logical processors),
Node 24.22.1, Headless Chrome 155. This is one local environment, not a Power BI
Desktop/Service performance guarantee.

| Case | Nodes | Edges | Parse ms | Layout ms | Full update ms | Select all ms |
|---|---:|---:|---:|---:|---:|---:|
| Chain | 26 | 25 | 0.4 | 1.2 | 16.3 | 2.4 |
| Chain | 101 | 100 | 0.6 | 2.2 | 38.7 | 5.2 |
| Chain | 251 | 250 | 1.1 | 4.6 | 81.0 | 9.3 |
| Chain | 500 | 499 | 1.8 | 7.4 | 123.9 | 20.5 |
| Cycle | 500 | 1000 | 6.4 | 18.0 | 229.4 | 32.0 |
| Branches | 500 | 1000 | 2.8 | 11.0 | 172.0 | 31.4 |
| Disconnected | 500 | 1000 | 3.0 | 10.2 | 182.5 | 31.5 |
| Parallel | 2 | 1000 | 1.7 | 3.7 | 141.2 | 26.0 |
| Flow Groups | 500 | 1000 | 3.7 | 32.6 | 204.9 | 42.4 |
| Long Unicode text | 101 | 100 | 1.4 | 27.8 | 89.1 | 6.0 |

Node incident-selection sets are now indexed once per update, instead of scanning
every edge for every node on each repaint. Exact selected identities use a key set
before falling back to inclusion matching for partial host selections. No before/
after speedup is claimed without a paired baseline measurement.

## Practical guidance

For report authoring, start with **up to about 100 nodes and 100-250 connections**
per view, and filter by process or Flow Group. This is a readability recommendation,
not a new enforced limit. Above that range, check interaction latency and actual
label readability on the target report canvas. The measured 1000-edge cases took
roughly 141-229 ms per full local update before Power BI's own model/query costs.

Graph shape matters as much as count. A 500-node chain is about 168,292 SVG units
wide, while the 1000-edge grouped fixture is about 9,120 x 8,554. Fit keeps these
graphs inside the viewport but cannot keep all labels readable. Dense cycles and
parallel routes can still overlap; this increment does not introduce a new layout
algorithm, pagination, virtualization, or background-worker cancellation. The
limits bound synchronous work; arbitrary device performance cannot be guaranteed.

## Manual Power BI validation

1. Package/reimport the updated visual. Generate the CSV fixtures using `profile`.
2. Import a fixture and assign matching roles; assign Flow Group for grouped data.
   Begin with `chain-100.csv`, then try `cycle-1000.csv` and `grouped-1000.csv`.
3. Check counts, signed/zero values, no repeated SVG after refresh, zoom/Fit,
   scrolling and selection. Resize and switch between smooth/right-angle edges.
4. Try `disconnected-1000.csv`, `parallel-1000.csv`, and `long-text-100.csv`.
   Long text must remain plain text; the visual must remain usable with filters.
5. Remove a required role, clear all rows with a report filter, and restore valid
   data. Each state should replace the graph and recovery should work.
6. In a copy of a fixture, add an invalid numeric value or empty endpoint; check
   the warning count. Add a 1001st row or text exceeding 4096 units; expect an
   explanatory error and no partial graph. Power BI may aggregate identical rows,
   so give added rows unique Tooltip IDs.
7. Check response times on your actual machine and in Service if applicable.
   Local browser timings exclude model queries and host filtering. Actual Power BI
   end-to-end validation remains pending user confirmation.
