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
import { runLint } from './runPgrls';
import { renderDiagnostics } from './diagnostics';
import { registerHoverProvider } from './hover';

let diagnosticCollection: vscode.DiagnosticCollection;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('pgrls');
    context.subscriptions.push(outputChannel);

    diagnosticCollection = vscode.languages.createDiagnosticCollection('pgrls');
    context.subscriptions.push(diagnosticCollection);

    // --- Commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand('pgrls.lint', () => lintCommand()),
        vscode.commands.registerCommand('pgrls.clearDiagnostics', () => {
            diagnosticCollection.clear();
            outputChannel.appendLine('Cleared pgrls diagnostics.');
        }),
        vscode.commands.registerCommand('pgrls.explainRule', () => explainRuleCommand()),
    );

    // --- Hover provider (rule_id under cursor → rule reference) ---
    context.subscriptions.push(registerHoverProvider());

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
        if (violations.length === 0) {
            vscode.window.showInformationMessage('pgrls: no findings.');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`pgrls lint failed: ${message}`);
        vscode.window.showErrorMessage(`pgrls: ${message}`);
    }
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
