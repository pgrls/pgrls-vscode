# Changelog

All notable changes to the pgrls VS Code extension.

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
