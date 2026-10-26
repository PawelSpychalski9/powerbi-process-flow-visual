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

For a `1:*` relationship to a detail table, `Tooltip ID` must be unique in this main table. Node titles and descriptions should be consistent across rows sharing the same `Source` identifier.
