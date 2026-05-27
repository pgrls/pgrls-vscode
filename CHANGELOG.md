# Changelog

All notable changes to the pgrls VS Code extension.

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
