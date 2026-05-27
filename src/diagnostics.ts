// Translate pgrls Violation objects into VS Code Diagnostics.
//
// Caveat: pgrls lints a *live database*, not source text — there is
// no file/line to anchor the diagnostic against. The CLI surfaces a
// `location` like `public.users::policy_name` (a qualified policy
// identifier), not a file:line:col. So this module surfaces every
// finding against the workspace's `pgrls.toml` (if present) as a
// fallback anchor; otherwise against a virtual URI. The Problems
// panel still shows every finding with its severity and message, and
// the URI lets the user click through to the config file where the
// rule's allowlist / severity override lives.
//
// A future iteration could map `location` to a file when a `.sql`
// migration file in the workspace defines the policy — but that
// requires SQL parsing on the extension side, which is out of scope
// for the v0.1.0 scaffold.
import * as vscode from 'vscode';
import { Violation } from './runPgrls';

const SEVERITY_MAP: Record<Violation['severity'], vscode.DiagnosticSeverity> = {
    error: vscode.DiagnosticSeverity.Error,
    warning: vscode.DiagnosticSeverity.Warning,
    info: vscode.DiagnosticSeverity.Information,
};

export function renderDiagnostics(
    collection: vscode.DiagnosticCollection,
    violations: Violation[],
): void {
    collection.clear();
    if (violations.length === 0) {
        return;
    }

    const anchor = anchorUri();
    const diagnostics: vscode.Diagnostic[] = violations.map((v) => {
        const range = new vscode.Range(0, 0, 0, 0);
        const message = formatDiagnosticMessage(v);
        const diag = new vscode.Diagnostic(
            range,
            message,
            SEVERITY_MAP[v.severity] ??
                vscode.DiagnosticSeverity.Information,
        );
        diag.source = 'pgrls';
        diag.code = {
            value: v.rule_id,
            // Link to the rule's per-rule anchor in docs/RULES.md
            // (lint rules) or AGENTS.md#diff-rules (DIFF_*) so a
            // reviewer can click through from the Problems panel.
            target: ruleReferenceUri(v.rule_id),
        };
        return diag;
    });
    collection.set(anchor, diagnostics);
}

function formatDiagnosticMessage(v: Violation): string {
    const loc = v.location ? ` [${v.location}]` : '';
    return `${v.title}${loc}\n${v.message}`;
}

function anchorUri(): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        // No workspace — surface against a virtual URI so the
        // Problems panel still shows the findings rather than
        // dropping them silently.
        return vscode.Uri.parse('pgrls:findings');
    }
    return vscode.Uri.joinPath(folder.uri, 'pgrls.toml');
}

function ruleReferenceUri(ruleId: string): vscode.Uri {
    if (ruleId.startsWith('DIFF_')) {
        return vscode.Uri.parse(
            'https://github.com/pgrls/pgrls/blob/main/AGENTS.md#diff-rules',
        );
    }
    return vscode.Uri.parse(
        `https://github.com/pgrls/pgrls/blob/main/docs/RULES.md#rule-${ruleId.toLowerCase()}`,
    );
}
