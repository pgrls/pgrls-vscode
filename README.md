# pgrls for VS Code

[![pgrls on PyPI](https://img.shields.io/pypi/v/pgrls.svg?label=pgrls%20on%20PyPI)](https://pypi.org/project/pgrls/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

VS Code extension for [pgrls](https://github.com/pgrls/pgrls) — the static
analyzer for Postgres Row-Level Security. Surfaces `pgrls lint` findings as
diagnostics in the Problems panel, with hover documentation per rule.

## Install

1. **Install pgrls itself** (the Python CLI):

   ```bash
   pip install pgrls
   ```

2. **Install this extension** from the VS Code marketplace.

3. Open a workspace that has a Postgres database. Configure the connection:

   - Set `pgrls.databaseUrl` in your VS Code settings, **or**
   - Export `DATABASE_URL` in your shell, **or**
   - Add `[database].url` to a `pgrls.toml` file at the workspace root.

## Use

Run **`pgrls: Lint database`** from the command palette
(`Cmd+Shift+P` / `Ctrl+Shift+P`). Findings appear in the Problems panel
with severity (error / warning / info), the rule ID as the diagnostic
code, and a link to the canonical rule reference. A **status-bar item**
shows the live finding count (`$(shield) pgrls: 3 errors, 1 warning`);
click it to re-lint.

Enable **`pgrls.lintOnSave`** in settings to re-run automatically
whenever a `.sql`, `.plpgsql`, or `pgrls.toml` file is saved.

## Quick fixes

When a finding's rule is mechanically auto-fixable, the Problems-panel
lightbulb offers two Quick-Fix actions:

- **Preview fixes (dry-run)** — runs `pgrls fix` and opens the
  remediation SQL in a new editor. Nothing touches the database. If
  there's nothing to remediate, it shows a notification instead.
- **Apply fixes to database…** — always dry-runs first and prints the
  SQL to the pgrls output channel, then asks to confirm. The
  confirmation spells out that the target is whatever pgrls resolves
  from `pgrls.databaseUrl` → `$DATABASE_URL` → `pgrls.toml` (not
  necessarily a local dev DB), and that pgrls re-checks the live schema
  at apply time — so the applied statements may differ from the preview
  if the database changed in between. On confirm it runs
  `pgrls fix --apply` in a single all-or-nothing transaction, then
  re-lints.

## Hover documentation

Hovering on any rule ID (`SEC003`, `DIFF_DROP_POLICY`, etc.) in any open
file shows the rule's **title, severity, and whether it's
auto-fixable** inline (pulled once per session from
`pgrls explain --format json`), plus a link to the full reference.
Falls back to a plain reference link when pgrls isn't on `PATH` or the
ID is a `DIFF_*` rule (those live in `AGENTS.md`, not the lint
catalog the hover caches).

## Configuration

| Setting | Default | Description |
|---|---|---|
| `pgrls.executable` | `pgrls` | Path to the CLI. Set absolute if installed in a venv. |
| `pgrls.databaseUrl` | (empty) | Postgres connection string. Falls back to `DATABASE_URL` env, then `pgrls.toml`. |
| `pgrls.configPath` | (empty) | Path to `pgrls.toml`. Empty uses pgrls's auto-discovery. |
| `pgrls.lintOnSave` | `false` | Re-lint on save. Off by default — linting hits the live database. |

## Commands

| Command | Description |
|---|---|
| `pgrls: Lint database` | Run `pgrls lint` and surface findings as diagnostics. |
| `pgrls: Clear findings` | Clear the diagnostic collection. |
| `pgrls: Explain a rule…` | Open the rule reference in your browser. |
| `pgrls: Preview fixes (dry-run)` | Run `pgrls fix` and show the remediation SQL — nothing applied. |
| `pgrls: Apply fixes to database…` | Preview the SQL, confirm against a DB-resolution warning, run `pgrls fix --apply`, then re-lint. |

## Caveats

- **Live-database linter.** pgrls inspects a real Postgres database, not source
  text. So findings have no source-file anchor — they surface against the
  workspace's `pgrls.toml` (where the rule's allowlist lives) or a virtual URI.
  A future iteration may map findings to `.sql` migration files when those
  files define the offending policy.
- **Pgrls must be on PATH.** The extension shells out via `child_process`;
  it does not bundle the Python runtime. Set `pgrls.executable` if your
  pgrls install lives in a virtualenv.

## License

MIT. See [LICENSE](LICENSE).

## See also

- [pgrls itself](https://github.com/pgrls/pgrls) — the CLI this extension wraps
- [Rule reference](https://github.com/pgrls/pgrls/blob/main/docs/RULES.md) — every rule with rationale, example, and fix
