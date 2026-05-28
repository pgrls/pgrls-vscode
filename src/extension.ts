// pgrls VS Code extension entry point.
//
// The extension is intentionally thin: pgrls is a Python CLI, so this
// extension wraps it via `child_process.spawn` rather than embedding a
// Language Server. The CLI is the source of truth for rule logic, JSON
// output shape, and configuration; the extension only translates
// `pgrls lint --format json` output into VS Code Diagnostic objects
// surfaced in the Problems panel, plus a hover provider that renders
// `pgrls explain --format markdown <rule>` for a rule ID under the
// cursor.
//
// Why no LSP today: pgrls lints a *live database*, not source text.
// LSP's incremental document-sync model doesn't map cleanly onto
// "introspect the DB and emit findings about its policies." A
// command-on-save (or manual) invocation is the right shape for now;
// a future iteration could spawn the linter against an open `.sql`
// migration file, but that's a separate scope.
import * as vscode from 'vscode';
import { runLint, runFix, Violation } from './runPgrls';
import { renderDiagnostics } from './diagnostics';
import { registerHoverProvider } from './hover';
import { registerCodeActionProvider } from './codeActions';
import { invalidateCatalog } from './catalog';

let diagnosticCollection: vscode.DiagnosticCollection;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('pgrls');
    context.subscriptions.push(outputChannel);

    diagnosticCollection = vscode.languages.createDiagnosticCollection('pgrls');
    context.subscriptions.push(diagnosticCollection);

    // --- Status bar (finding counts; click → lint) ---
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        0,
    );
    statusBarItem.command = 'pgrls.lint';
    setStatusIdle();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // --- Commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand('pgrls.lint', () => lintCommand()),
        vscode.commands.registerCommand('pgrls.clearDiagnostics', () => {
            diagnosticCollection.clear();
            setStatusIdle();
            outputChannel.appendLine('Cleared pgrls diagnostics.');
        }),
        vscode.commands.registerCommand('pgrls.explainRule', () => explainRuleCommand()),
        vscode.commands.registerCommand('pgrls.previewFixes', () => fixCommand(false)),
        vscode.commands.registerCommand('pgrls.applyFixes', () => fixCommand(true)),
    );

    // --- Hover provider (rule_id under cursor → rule reference) ---
    context.subscriptions.push(registerHoverProvider());

    // --- Quick-Fix code actions for auto-fixable findings ---
    context.subscriptions.push(registerCodeActionProvider());

    // --- Invalidate the rule-catalog cache when the executable changes ---
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('pgrls.executable')) {
                invalidateCatalog();
            }
        }),
    );

    // --- Lint-on-save (opt-in via pgrls.lintOnSave) ---
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            const cfg = vscode.workspace.getConfiguration('pgrls');
            if (!cfg.get<boolean>('lintOnSave')) {
                return;
            }
            if (doc.languageId === 'sql' || doc.languageId === 'plpgsql') {
                void lintCommand();
            }
            if (doc.uri.fsPath.endsWith('pgrls.toml')) {
                void lintCommand();
            }
        }),
    );
}

export function deactivate(): void {
    // VS Code disposes our subscriptions automatically; nothing extra.
}

async function lintCommand(): Promise<void> {
    outputChannel.appendLine('Running pgrls lint…');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage(
            'pgrls: open a workspace folder first.',
        );
        return;
    }
    try {
        const violations = await runLint(workspaceFolder.uri.fsPath);
        outputChannel.appendLine(
            `pgrls lint finished: ${violations.length} finding(s).`,
        );
        renderDiagnostics(diagnosticCollection, violations);
        setStatusCounts(violations);
        if (violations.length === 0) {
            vscode.window.showInformationMessage('pgrls: no findings.');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`pgrls lint failed: ${message}`);
        vscode.window.showErrorMessage(`pgrls: ${message}`);
        statusBarItem.text = '$(shield) pgrls: error';
        statusBarItem.tooltip = `pgrls lint failed: ${message}`;
    }
}

/**
 * Run `pgrls fix`. `apply=false` previews the remediation SQL in a new
 * editor (dry-run, nothing touches the DB); `apply=true` runs
 * `--apply` after a confirmation modal, then re-lints to refresh the
 * findings.
 */
async function fixCommand(apply: boolean): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('pgrls: open a workspace folder first.');
        return;
    }

    if (apply) {
        const choice = await vscode.window.showWarningMessage(
            'pgrls: apply auto-fixes to the configured database? ' +
                'This runs `pgrls fix --apply` in a single all-or-nothing ' +
                'transaction.',
            { modal: true },
            'Apply',
        );
        if (choice !== 'Apply') {
            return;
        }
    }

    outputChannel.appendLine(
        apply ? 'Running pgrls fix --apply…' : 'Running pgrls fix (dry-run)…',
    );
    try {
        const out = await runFix(workspaceFolder.uri.fsPath, { apply });
        if (apply) {
            outputChannel.appendLine(out.trim() || 'pgrls fix applied.');
            vscode.window.showInformationMessage(
                'pgrls: fixes applied. Re-linting…',
            );
            await lintCommand();
        } else {
            const doc = await vscode.workspace.openTextDocument({
                language: 'sql',
                content:
                    out.trim() ||
                    '-- pgrls fix: nothing to remediate (no auto-fixable findings).',
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`pgrls fix failed: ${message}`);
        vscode.window.showErrorMessage(`pgrls: ${message}`);
    }
}

function setStatusIdle(): void {
    statusBarItem.text = '$(shield) pgrls';
    statusBarItem.tooltip = 'Run pgrls lint';
}

function setStatusCounts(violations: Violation[]): void {
    if (violations.length === 0) {
        statusBarItem.text = '$(shield) pgrls: clean';
        statusBarItem.tooltip = 'pgrls: no findings';
        return;
    }
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const v of violations) {
        if (v.severity === 'error') {
            errors++;
        } else if (v.severity === 'warning') {
            warnings++;
        } else {
            infos++;
        }
    }
    const parts: string[] = [];
    if (errors) {
        parts.push(`$(error) ${errors}`);
    }
    if (warnings) {
        parts.push(`$(warning) ${warnings}`);
    }
    if (infos) {
        parts.push(`$(info) ${infos}`);
    }
    statusBarItem.text = `$(shield) pgrls: ${parts.join(' ')}`;
    statusBarItem.tooltip =
        `pgrls: ${errors} error(s), ${warnings} warning(s), ` +
        `${infos} info(s) — click to re-lint`;
}

async function explainRuleCommand(): Promise<void> {
    const rule = await vscode.window.showInputBox({
        prompt: 'Rule ID to explain (e.g. SEC003)',
        validateInput: (value) =>
            /^[A-Z]+\d+$|^DIFF_[A-Z_]+$/.test(value.trim())
                ? null
                : 'Expected a rule ID like SEC001 or DIFF_DROP_POLICY.',
    });
    if (!rule) {
        return;
    }
    // Implementation in a follow-up iteration: spawn `pgrls explain
    // --format markdown <rule>`, render in a webview / Markdown
    // preview. For the v0.1.0 scaffold, just open the canonical
    // docs URL so the command appears in the palette.
    const url = vscode.Uri.parse(
        `https://github.com/pgrls/pgrls/blob/main/docs/RULES.md#rule-${rule.toLowerCase()}`,
    );
    void vscode.env.openExternal(url);
}
