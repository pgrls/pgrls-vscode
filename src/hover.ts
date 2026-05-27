// Hover provider: when the user hovers a rule ID anywhere (`SEC003`,
// `DIFF_DROP_POLICY`, etc.) in any text document, surface a link to
// the canonical rule reference. Lightweight by design — we don't
// shell out to `pgrls explain` on every hover (that would invoke
// Python repeatedly); we just produce a static link the reader can
// follow. A richer hover (full rule docstring inline) is a future
// iteration that would cache `pgrls explain --format json --all`
// output once per session.
import * as vscode from 'vscode';

const RULE_ID_PATTERN = /\b(?:SEC|PERF|HYG|VIEW)\d{3}\b|\bDIFF_[A-Z_]+\b/;

export function registerHoverProvider(): vscode.Disposable {
    return vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(
                    position,
                    RULE_ID_PATTERN,
                );
                if (!range) {
                    return undefined;
                }
                const ruleId = document.getText(range);
                const md = new vscode.MarkdownString(
                    `**${ruleId}** — pgrls rule\n\n` +
                        `[→ Reference](${ruleReferenceUrl(ruleId)})`,
                );
                md.isTrusted = true;
                return new vscode.Hover(md, range);
            },
        },
    );
}

function ruleReferenceUrl(ruleId: string): string {
    if (ruleId.startsWith('DIFF_')) {
        return 'https://github.com/pgrls/pgrls/blob/main/AGENTS.md#diff-rules';
    }
    return (
        'https://github.com/pgrls/pgrls/blob/main/docs/RULES.md#rule-' +
        ruleId.toLowerCase()
    );
}
