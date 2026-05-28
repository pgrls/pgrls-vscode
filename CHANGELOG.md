# Changelog

All notable changes to the pgrls VS Code extension.

## [0.2.1] - 2026-05-28

### Changed

- **Apply-fixes safety.** "Apply fixes to database…" now always runs
  the dry-run first, prints the exact SQL to the pgrls output channel,
  and the confirmation states plainly that the target DB is whatever
  pgrls resolves from `pgrls.databaseUrl` → `$DATABASE_URL` →
  `pgrls.toml` (not necessarily a local dev database) — so a
  `$DATABASE_URL` pointed elsewhere can't be mutated from a
  dev-looking prompt. The confirmation also notes that pgrls re-checks
  the live schema at apply time, so the applied statements may differ
  from the previewed SQL if the database changed in between.
- **No-op fixes show a notification, not an empty editor.** When
  `pgrls fix` finds nothing to remediate, both Quick-Fix actions now
  show a "nothing to fix" notification instead of opening an editor
  with a placeholder comment.

### Fixed

- **`Explain a rule…` now opens the right page for `DIFF_*` rules.**
  The command accepts diff-rule IDs (e.g. `DIFF_DROP_POLICY`) but was
  sending them to a dead `docs/RULES.md` anchor; diff rules are
  documented in `AGENTS.md`. The rule-ID → docs-URL mapping is now
  shared (`ruleDocs.ts`) across the command, the hover, and the
  diagnostic link so all three route identically. The command's input
  box also validates against the real rule families
  (`SEC`/`PERF`/`HYG`/`VIEW` + `DIFF_*`), rejecting malformed IDs.
- README now documents the full hover fallback (also fires for
  `DIFF_*` rule IDs, which aren't in the lint catalog the hover
  caches).
- Removed stale "v0.1.0 scaffold" comments (one misdescribed the
  shipped `Explain a rule…` command).
- `pgrls.lintOnSave` setting description now lists all three triggers
  (`.sql`, `.plpgsql`, `pgrls.toml`) and fixes a `.pgrls.toml` typo.

## [0.2.0] - 2026-05-28

### Added

- **Quick-Fix code actions.** When a finding's rule is mechanically
  auto-fixable, the Problems-panel lightbulb offers "Preview fixes
  (dry-run)" (runs `pgrls fix`, opens the remediation SQL in a new
  editor) and "Apply fixes to database…" (runs `pgrls fix --apply`
  behind a confirmation, then re-lints). New commands
  `pgrls.previewFixes` / `pgrls.applyFixes`.
- **Status-bar finding count.** A `$(shield) pgrls: N errors, M
  warnings` item reflects the latest lint; click to re-lint.
- **Richer hover.** Hovering a rule ID now shows the rule's title,
  severity, and auto-fixable status inline (from the session-cached
  `pgrls explain --format json` catalog), not just a reference link.
  Falls back to the plain link when pgrls isn't on `PATH` or the ID is
  a `DIFF_*` rule the catalog doesn't enumerate.

### Internal

- Rule catalog cached once per session (`catalog.ts`), invalidated on
  `pgrls.executable` change. Powers the hover and the fixable check.

## [0.1.0] - 2026-05-26

### Added

- Initial scaffold.
- `pgrls: Lint database` command — runs `pgrls lint --format json`,
  surfaces findings as diagnostics in the Problems panel.
- `pgrls: Clear findings` command.
- `pgrls: Explain a rule…` command — opens the rule reference in
  the user's browser.
- Hover provider — hovering on any rule ID (`SEC003`,
  `DIFF_DROP_POLICY`, etc.) in any open file surfaces a link to
  the canonical rule reference.
- `pgrls.lintOnSave` setting — re-run lint when a `.sql` or
  `pgrls.toml` file is saved. Disabled by default (lint hits a
  live database).
- Configuration: `pgrls.executable`, `pgrls.databaseUrl`,
  `pgrls.configPath`, `pgrls.lintOnSave`.
