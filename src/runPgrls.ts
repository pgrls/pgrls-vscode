// Run the pgrls CLI and parse its `--format json` output.
//
// The JSON shape is documented in pgrls's `src/pgrls/formatters/json.py`
// and is part of the stable CI contract: `{ violations: [...] }`, where
// each violation carries rule_id, severity, title, message, and
// (optional) location. This module is the only place that knows the
// pgrls CLI invocation shape, so when the CLI grows new flags the
// patch lands here, not in extension.ts.
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

export type Severity = 'error' | 'warning' | 'info';

export interface Violation {
    rule_id: string;
    severity: Severity;
    title: string;
    message: string;
    location: string | null;
}

interface PgrlsJsonOutput {
    violations: Violation[];
}

export async function runLint(workspaceRoot: string): Promise<Violation[]> {
    const cfg = vscode.workspace.getConfiguration('pgrls');
    const executable = cfg.get<string>('executable') || 'pgrls';
    const databaseUrl = cfg.get<string>('databaseUrl');
    const configPath = cfg.get<string>('configPath');

    const args = ['lint', '--format', 'json'];
    if (databaseUrl) {
        args.push('--database-url', databaseUrl);
    }
    if (configPath) {
        args.push('--config', configPath);
    }

    // `pgrls lint` exits non-zero when findings are present (the
    // CI-gating contract). The extension does NOT treat that as an
    // error — findings are normal output. Only an exit code from a
    // failure shape (no DB, bad config, CLI missing) is surfaced as
    // a hard error.
    const { stdout, stderr, exitCode } = await spawnPgrls(
        executable,
        args,
        workspaceRoot,
    );

    // Exit codes: 0 (no findings), 1 (findings present), 2 (tool error
    // — missing DB, bad config, etc.). We treat 0 and 1 as success.
    if (exitCode === 2 || (exitCode !== 0 && exitCode !== 1)) {
        throw new Error(
            stderr.trim() ||
                `pgrls exited with code ${exitCode}. ` +
                    'Run `pgrls lint` in a terminal to see the full error.',
        );
    }

    if (!stdout.trim()) {
        return [];
    }
    let parsed: PgrlsJsonOutput;
    try {
        parsed = JSON.parse(stdout) as PgrlsJsonOutput;
    } catch (err) {
        throw new Error(
            `Could not parse pgrls JSON output: ${
                err instanceof Error ? err.message : String(err)
            }`,
        );
    }
    return parsed.violations ?? [];
}

function spawnPgrls(
    executable: string,
    args: string[],
    cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd, env: process.env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('error', (err) => {
            // ENOENT: the executable wasn't found on PATH. Surface a
            // friendlier message than Node's default — most pgrls
            // users install via `pip install pgrls` and forget to
            // activate the venv.
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                reject(
                    new Error(
                        `Could not find pgrls executable '${executable}'. ` +
                            'Install with `pip install pgrls` (and activate ' +
                            'the venv), or set `pgrls.executable` to the ' +
                            'absolute path.',
                    ),
                );
                return;
            }
            reject(err);
        });
        child.on('close', (code) =>
            resolve({ stdout, stderr, exitCode: code ?? -1 }),
        );
    });
}
