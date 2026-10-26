# Power BI Process Flow — Sample Data

This CSV provides sample connections for a Power BI process-flow visual. Each row represents a directed link from `Source` to `Target`, with a numeric value and optional metadata for node labels, grouping, and tooltips.

| Column | Meaning | Power BI data type |
|---|---|---|
| Source | Unique identifier of the starting node (required). | Text |
| Target | Unique identifier of the destination node (required). | Text |
| Value | Numeric value displayed on the connection (required; negative values allowed). | Decimal number |
| Tooltip ID | Optional key linking this connection to related detail records in the data model. | Text |
| Node Title | Display title of the `Source` node. | Text |
| Node Description | Description of the `Source` node. | Text |
| Label | Optional label shown on the connection. | Text |
| Group | Optional category for grouping or coloring the connection. | Text |
| Flow Group | Optional container name assigned to the `Source` node. | Text |

For a `1:*` relationship to a detail table, `Tooltip ID` must be unique in this main table. Node titles and descriptions should be consistent across rows sharing the same `Source` identifier.

`Flow Group` is optional. If it is not assigned in the visual, the original graph
layout is retained with no containers. Null, empty, or whitespace-only values mean
ungrouped. Non-empty names are trimmed at their boundaries. Target-only nodes
remain ungrouped; a Target inherits membership only when the same ID also has a
consistent Source record elsewhere in the received data.

All valid Source rows for a node must agree, including whether the node is
ungrouped. Conflicting names, or a mixture of a name and blank values, produce a
visible warning and leave that node ungrouped. The visual never picks an arbitrary
group. Row order does not affect this policy.

`Group` categorizes an **edge**. `Flow Group` contains **nodes**. The two fields
are independent and must not be substituted for each other.

The sample retains eight nodes and nine directed, signed connections. B, C, and D
belong to **Processing**; E, F, and G belong to **Output**. A and target-only H are
ungrouped. It includes internal connections (B → C/D and E → F/G), connections
between groups (C/D → E), and grouped/ungrouped connections (A → B and F/G → H).

For updating an existing Power BI report, see
[the example report instructions](../example_powerbi_raport/README.md).
