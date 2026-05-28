// Hover provider: when the user hovers a rule ID anywhere (`SEC003`,
// `DIFF_DROP_POLICY`, etc.) in any text document, surface the rule's
// title, severity, and auto-fixable status inline, plus a link to the
// canonical reference.
//
// The rule metadata comes from the session-cached rule catalog
// (`pgrls explain --format json`, loaded once — see catalog.ts), so a
// hover is a cheap map lookup, not a Python invocation. If the catalog
// is unavailable (pgrls not on PATH) or the ID isn't a known lint rule
// (e.g. a `DIFF_*` rule, which the catalog doesn't enumerate), the
// hover degrades to the static reference link it showed in v0.1.0.
import * as vscode from 'vscode';
import { getCatalog } from './catalog';
import { ruleReferenceUrl } from './ruleDocs';

const RULE_ID_PATTERN = /\b(?:SEC|PERF|HYG|VIEW)\d{3}\b|\bDIFF_[A-Z_]+\b/;

const SEVERITY_LABEL: Record<string, string> = {
    error: '$(error) error',
    warning: '$(warning) warning',
    info: '$(info) info',
};

export function registerHoverProvider(): vscode.Disposable {
    return vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        {
            async provideHover(document, position) {
                const range = document.getWordRangeAtPosition(
                    position,
                    RULE_ID_PATTERN,
                );
                if (!range) {
                    return undefined;
                }
                const ruleId = document.getText(range);
                const reference = ruleReferenceUrl(ruleId);

                const catalog = await getCatalog();
                const info = catalog.get(ruleId);

                let md: vscode.MarkdownString;
                if (info) {
                    const sev = SEVERITY_LABEL[info.severity] ?? info.severity;
                    const fixable = info.fixable
                        ? '\n\n$(wrench) Auto-fixable — run `pgrls fix`.'
                        : '';
                    md = new vscode.MarkdownString(
                        `**${info.id} — ${info.title}**\n\n` +
                            `${sev}${fixable}\n\n` +
                            `[→ Reference](${reference})`,
                    );
                    md.supportThemeIcons = true;
                } else {
                    // Unknown to the catalog (DIFF_* rule, or pgrls not
                    // reachable) — fall back to the static link.
                    md = new vscode.MarkdownString(
                        `**${ruleId}** — pgrls rule\n\n` +
                            `[→ Reference](${reference})`,
                    );
                }
                md.isTrusted = true;
                return new vscode.Hover(md, range);
            },
        },
    );
}
