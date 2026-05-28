// Single source of truth for a rule ID → canonical documentation URL.
//
// pgrls documents its two rule families in two places: lint rules
// (SEC/PERF/HYG/VIEW) get a per-rule anchor in docs/RULES.md, while the
// schema-diff rules (DIFF_*) are documented together in AGENTS.md under
// the "Diff rules" heading (they aren't enumerated in docs/RULES.md).
//
// This mapping is correctness-critical and was previously duplicated
// across the hover provider, the diagnostic code-link, and the
// "Explain a rule…" command — and one copy forgot the DIFF_* branch,
// sending DIFF rules to a dead RULES.md anchor. Keep it here so every
// call site routes the same way and a future docs move is one edit.
export function ruleReferenceUrl(ruleId: string): string {
    if (ruleId.startsWith('DIFF_')) {
        return 'https://github.com/pgrls/pgrls/blob/main/AGENTS.md#diff-rules';
    }
    return (
        'https://github.com/pgrls/pgrls/blob/main/docs/RULES.md#rule-' +
        ruleId.toLowerCase()
    );
}
