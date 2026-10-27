# Power BI Process Flow Visual

An open-source Power BI custom visual project for process flow diagrams.

The visual renders directed process graphs with signed edge labels, node titles,
theme-aware formatting, high contrast, and zoom/Fit controls. The optional
`Flow Group` field encloses Source nodes in titled, configurable containers;
without it the original graph layout is preserved. Native report tooltips and
selection interactions are later milestones.

## Repository structure

- `process-flow/`: visual source code, assets, configuration, and npm dependencies.
- `example_data/`: sample CSV data and a description of its columns.
- `example_powerbi_raport/`: instructions for updating an existing example report.
- `LICENSE`: MIT license.

## Setup

Install Node.js 20.19.0 or newer and npm. Development has been verified with Node.js 24.
Run the following commands from the repository root:

```powershell
cd process-flow
npm.cmd ci
```

Power BI Visuals Tools is installed locally by npm; a global installation is not
required. The `.cmd` commands also work when PowerShell blocks npm's `.ps1` script.
On macOS or Linux, use `npm` instead of `npm.cmd`.

## Development certificate

On Windows, run this once in your own terminal before starting the server:

```powershell
npm.cmd run pbiviz -- install-cert
```

If the certificate import wizard opens, select Current User and import the
localhost certificate into Trusted Root Certification Authorities. If prompted
for its password, read the locally generated file:

```powershell
Get-Content "$env:USERPROFILE\pbiviz-certs\PowerBICustomVisualTestPass.txt"
```

Keep the certificate, its private key, and its password outside version control.

## Run and build

Run these commands from `process-flow/`:

```powershell
npm.cmd start
```

The development server listens at `https://localhost:8080/` and rebuilds on source
changes. It serves visual assets for Power BI; it does not provide a standalone
page at `/`. To stop it, press Ctrl+C in its terminal.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:browser
npm.cmd run package
```

Packaging produces a `.pbiviz` file in `process-flow/dist/` that can be imported
into Power BI. Dependencies, certificates, and generated build files are ignored
by Git. Commit `package-lock.json` to preserve the dependency versions.

See [the sample data documentation](example_data/README.md) for the CSV format.
See [Flow Groups](process-flow/docs/flow-groups.md) for membership rules, layout,
formatting, limitations, and Power BI Desktop validation.
