// Quick-Fix code actions for auto-fixable pgrls findings.
//
// When the cursor is on a pgrls diagnostic whose rule is mechanically
// auto-fixable (per the rule catalog's `fixable` flag), VS Code's
// lightbulb offers two actions:
//
//   • "pgrls: preview fixes (dry-run)" → runs `pgrls fix` and opens
//     the remediation SQL in a new editor. Nothing touches the DB.
//   • "pgrls: apply fixes to database" → always dry-runs first, prints
//     the exact SQL to the output channel, then asks to confirm via a
//     modal that names the DB pgrls will resolve before running
//     `pgrls fix --apply` (it mutates the live database in an
//     all-or-nothing transaction). See `fixCommand` in extension.ts.
//
// `pgrls fix` is global (it remediates every fixable finding, not one
// row), so the same pair of actions is offered whenever *any* fixable
// pgrls diagnostic is in scope — they aren't per-finding.
import * as vscode from 'vscode';
import { getCatalog } from './catalog';

export function registerCodeActionProvider(): vscode.Disposable {
    return vscode.languages.registerCodeActionsProvider(
        { scheme: 'file' },
        new PgrlsFixActionProvider(),
        {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
        },
    );
}

class PgrlsFixActionProvider implements vscode.CodeActionProvider {
    async provideCodeActions(
        _document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
    ): Promise<vscode.CodeAction[]> {
        const pgrlsDiags = context.diagnostics.filter(
            (d) => d.source === 'pgrls',
        );
        if (pgrlsDiags.length === 0) {
            return [];
        }

        const catalog = await getCatalog();
        const hasFixable = pgrlsDiags.some((d) => {
            const ruleId =
                typeof d.code === 'object' && d.code
                    ? String(d.code.value)
                    : String(d.code ?? '');
            return catalog.get(ruleId)?.fixable ?? false;
        });
        if (!hasFixable) {
            return [];
        }

        const preview = new vscode.CodeAction(
            'pgrls: preview fixes (dry-run)',
            vscode.CodeActionKind.QuickFix,
        );
        preview.command = {
            command: 'pgrls.previewFixes',
            title: 'pgrls: preview fixes (dry-run)',
        };
        preview.diagnostics = pgrlsDiags;

        const apply = new vscode.CodeAction(
            'pgrls: apply fixes to database…',
            vscode.CodeActionKind.QuickFix,
        );
        apply.command = {
            command: 'pgrls.applyFixes',
            title: 'pgrls: apply fixes to database…',
        };
        apply.diagnostics = pgrlsDiags;

        return [preview, apply];
    }
}
