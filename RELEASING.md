# Releasing

Publishing is automated by [`.github/workflows/publish.yml`](.github/workflows/publish.yml):
when a **GitHub Release** is published, the workflow packages the extension
once and publishes the identical `.vsix` to the **VS Code Marketplace** and
**Open VSX**, then attaches the `.vsix` to the Release.

## One-time setup

The workflow needs two repository secrets
(**Settings → Secrets and variables → Actions**):

| Secret | What it is | How to get it |
|---|---|---|
| `VSCE_PAT` | Azure DevOps Personal Access Token for the `pgrls` Marketplace publisher | Create the `pgrls` publisher at <https://marketplace.visualstudio.com/manage>, then generate a PAT in Azure DevOps with **Marketplace → Manage** scope (org: **All accessible organizations**). |
| `OVSX_PAT` | Open VSX access token | Sign in at <https://open-vsx.org>, then **Settings → Access Tokens**. |

Open VSX also needs the **namespace** to exist once, owned by the token's
account. `vsce` and `ovsx` are pinned devDependencies, so run `npm ci`
first and every command below uses the locked local copies:

```bash
npm ci
npx ovsx create-namespace pgrls -p "$OVSX_PAT"
```

(The VS Code Marketplace `pgrls` publisher likewise must exist before the
first publish — creating the PAT above already requires it.)

## Cutting a release

1. Land the changes on `main` (PR + green CI). Bump `version` in
   `package.json` and add a `CHANGELOG.md` entry.
2. Tag the merge commit and push the tag:
   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
3. Create the GitHub Release for that tag (notes from the CHANGELOG):
   ```bash
   gh release create vX.Y.Z --title "pgrls-vscode vX.Y.Z" --notes-file notes.md
   ```
   Publishing the Release triggers `publish.yml`. The workflow fails fast
   if the tag (`vX.Y.Z`) doesn't match `package.json` (`X.Y.Z`).

## Manual fallback

If you need to publish without a Release (e.g. secrets not yet set):

```bash
npm ci
npx vsce package -o pgrls.vsix
VSCE_PAT=… npx vsce publish --packagePath pgrls.vsix
OVSX_PAT=… npx ovsx publish pgrls.vsix
```

The two registries are independent. If the automated run publishes to one
but fails on the other, don't re-run the whole Release — both tools reject
a duplicate version, so the re-run would error on the registry that already
has it. Instead publish only the missing registry with its command above.
