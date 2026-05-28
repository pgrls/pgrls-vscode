// Rule catalog cache.
//
// `pgrls explain --format json` (no rule argument) emits the full rule
// catalog: `{ pgrls_version, count, rules: [{ id, severity, title,
// fixable }] }`. The hover provider and the Quick-Fix code-action
// provider both need this metadata (a rule's title/severity for the
// hover, its `fixable` flag for the lightbulb). Shelling out to Python
// on every hover would be wasteful, so we run it once per session and
// cache the result, keyed by the resolved `pgrls.executable` so a
// config change invalidates the cache.
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

export interface RuleInfo {
    id: string;
    severity: 'error' | 'warning' | 'info';
    title: string;
    fixable: boolean;
}

interface CatalogJson {
    pgrls_version: string;
    count: number;
    rules: RuleInfo[];
}

let cache: Map<string, RuleInfo> | undefined;
let cacheKey: string | undefined;

/** Reset the cache — called when configuration changes. */
export function invalidateCatalog(): void {
    cache = undefined;
    cacheKey = undefined;
}

/**
 * Return the rule catalog as an id→RuleInfo map, cached per session.
 * Resolves to an empty map if the CLI can't be run (e.g. pgrls not on
 * PATH) — callers degrade gracefully to the static reference link.
 */
export async function getCatalog(): Promise<Map<string, RuleInfo>> {
    const executable =
        vscode.workspace.getConfiguration('pgrls').get<string>('executable') ||
        'pgrls';
    if (cache && cacheKey === executable) {
        return cache;
    }
    try {
        const rules = await loadCatalog(executable);
        cache = new Map(rules.map((r) => [r.id, r]));
        cacheKey = executable;
    } catch {
        // Degrade silently — the hover still renders the reference
        // link, the code-action provider just offers nothing.
        cache = new Map();
        cacheKey = executable;
    }
    return cache;
}

function loadCatalog(executable: string): Promise<RuleInfo[]> {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, ['explain', '--format', 'json'], {
            env: process.env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `exit ${code}`));
                return;
            }
            try {
                const parsed = JSON.parse(stdout) as CatalogJson;
                resolve(parsed.rules ?? []);
            } catch (err) {
                reject(err);
            }
        });
    });
}
