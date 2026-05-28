// pgrls VS Code extension entry point.
//
// The extension is intentionally thin: pgrls is a Python CLI, so this
// extension wraps it via `child_process.spawn` rather than embedding a
// Language Server. The CLI is the source of truth for rule logic, JSON
// output shape, and configuration; the extension only translates
// `pgrls lint --format json` output into VS Code Diagnostic objects
// surfaced in the Problems panel, plus a hover provider that shows a
// rule's title/severity/fixable status (from the session-cached
// `pgrls explain --format json` catalog) for a rule ID under the
// cursor, and Quick-Fix code actions that run `pgrls fix`.
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
import { ruleReferenceUrl } from './ruleDocs';

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
 * editor (dry-run, nothing touches the DB). Either mode shows a
 * "nothing to fix" notification (and opens no editor) when the dry-run
 * finds no auto-fixable findings.
 *
 * `apply=true` ALWAYS runs the dry-run first, shows the exact SQL in
 * the output channel, and only then asks to confirm — so the user
 * sees precisely what will run before any mutation. The confirmation
 * is explicit that the target database is whatever pgrls resolves
 * from `pgrls.databaseUrl`, then `$DATABASE_URL`, then `pgrls.toml`
 * (the extension does not pin it), because a `$DATABASE_URL` pointed
 * at a non-dev database is an easy and expensive mistake.
 */
async function fixCommand(apply: boolean): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('pgrls: open a workspace folder first.');
        return;
    }
    const root = workspaceFolder.uri.fsPath;

    try {
        // Dry-run first — for preview this is the whole job; for apply
        // it's what we show the user before they commit to mutating a
        // live database.
        const sql = (await runFix(root, { apply: false })).stdout.trim();

        if (!sql) {
            vscode.window.showInformationMessage(
                'pgrls: nothing to fix (no auto-fixable findings).',
            );
            return;
        }

        if (!apply) {
            const doc = await vscode.workspace.openTextDocument({
                language: 'sql',
                content: sql,
            });
            await vscode.window.showTextDocument(doc, { preview: true });
            return;
        }

        // apply: show the previewed SQL, then confirm against an
        // explicit DB-resolution warning.
        outputChannel.appendLine('pgrls fix preview:\n' + sql);
        outputChannel.show(true);
        const choice = await vscode.window.showWarningMessage(
            'pgrls: apply auto-fixes? They run in one all-or-nothing ' +
                'transaction against the database pgrls resolves from ' +
                'pgrls.databaseUrl, then $DATABASE_URL, then pgrls.toml — ' +
                'NOT necessarily a local dev DB. The SQL previewed above is ' +
                'in the pgrls output channel; pgrls re-checks the live ' +
                'schema at apply time, so the applied statements may differ ' +
                'if the database changed since the preview.',
            { modal: true },
            'Apply',
        );
        if (choice !== 'Apply') {
            return;
        }

        outputChannel.appendLine('Running pgrls fix --apply…');
        const { stderr } = await runFix(root, { apply: true });
        // `--apply` prints the applied SQL to stdout and its
        // "applied N fixes" summary to stderr; surface the summary.
        outputChannel.appendLine(stderr.trim() || 'pgrls fix applied.');
        vscode.window.showInformationMessage('pgrls: fixes applied. Re-linting…');
        await lintCommand();
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
            /^(?:SEC|PERF|HYG|VIEW)\d{3}$|^DIFF_[A-Z_]+$/.test(value.trim())
                ? null
                : 'Expected a rule ID like SEC001 or DIFF_DROP_POLICY.',
    });
    if (!rule) {
        return;
    }
    // Open the rule's canonical reference in the user's browser. Routes
    // DIFF_* rules to AGENTS.md and lint rules to docs/RULES.md via the
    // shared mapping (see ruleDocs.ts) — the input box accepts both.
    // (A future iteration could render `pgrls explain --format
    // markdown <rule>` inline in a webview; opening the docs is the
    // current, intended behavior.)
    const url = vscode.Uri.parse(ruleReferenceUrl(rule.trim()));
    void vscode.env.openExternal(url);
}
