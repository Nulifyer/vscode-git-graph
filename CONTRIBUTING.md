# Contributing to Git Graphity

This fork is maintained by [nulifyer](https://github.com/Nulifyer). The original project is [Michael Hutchison's Git Graph](https://github.com/mhutchie/vscode-git-graph). Preserve the original license and source attribution.

Use [the fork repository](https://github.com/Nulifyer/vscode-git-graph) and [its issue tracker](https://github.com/Nulifyer/vscode-git-graph/issues) for contributions and support.

## Development

Use Bun 1.4.3, Node 24 or newer, and stable VS Code 1.141.0 or newer.

```bash
bun install --frozen-lockfile
bun run check
```

The extension runs in VS Code's Node extension host. Bun owns package installation, build orchestration, and webview minification. TypeScript 6.0.3 is retained until TypeScript ESLint and ts-jest support TypeScript 7.

The frontend reads shared types directly from `src/types.ts`. It does not require a prior backend build. Run `bun run typecheck` to check the source, webview, tests, and build scripts. Build scripts skip third-party Bun declaration checks; application and test declarations remain checked.

## Debugging and verification

Press F5 to open an Extension Development Host. Build first with `bun run compile`. Use `bun run compile-web-debug` and `Developer: Open Webview Developer Tools` to inspect the frontend.

Run `bun run test-extension-host` to test activation, rendered commit rows and graph SVG, commit details opened by a webview click, and real Git parsing. The test also checks live theme changes in dark, light, and both high-contrast themes. Set `VSCODE_EXECUTABLE_PATH` to use an installed VS Code executable. Otherwise the test downloads the release specified by the manifest. Linux requires a display; CI uses `xvfb-run`.

## Local installation

Git Graphity uses separate command IDs and settings. Previous extension settings and saved state do not transfer automatically.

```bash
bun run package-and-install
```

The packaging tool is a pinned local dependency. Fully quit VS Code and reopen it after replacing the extension. Installed users do not need Bun.

## Distribution

The existing license prohibits distributing derivative works. Changing maintainer metadata does not change those terms.

To test an installed custom theme, set `VSCODE_TEST_THEME_EXTENSION` to its extension directory and `VSCODE_TEST_THEME_NAME` to its theme ID. Set `VSCODE_TEST_GRAPH_COLOURS` to a JSON array to check a custom graph palette. All configuration changes use the temporary test profile.

## GitHub releases and Marketplace publishing

The `Release` workflow runs when a GitHub release is published. Its tag must be `v` followed by the committed `package.json` version. It rejects mismatches rather than changing the version during CI.

The reusable `Build & Test` workflow runs lint, typechecking, and tests on Node 24 and 26. It builds one VSIX with the Bun version pinned in `packageManager`, then tests that packaged extension in VS Code. The release workflow attaches the verified VSIX and its SHA-256 checksum to the GitHub release. Marketplace publishing downloads those assets, verifies the checksum, and publishes that file without rebuilding it.

Add an Azure DevOps Marketplace Manage PAT for the `nulifyer` publisher as the repository secret `VSCE_PAT`, matching the guget setup. Enter the token through the hidden CLI prompt:

```bash
gh secret set VSCE_PAT --repo Nulifyer/vscode-git-graph
```

The GitHub release upload uses the automatic `GITHUB_TOKEN`; it does not need a separate GitHub PAT. The Marketplace PAT is exposed only to the publishing step.

After committing and pushing a version change, tag that commit and push the tag. Publish the GitHub release to start the workflow. For the current version:

```bash
git tag v1.32.5
git push origin v1.32.5
gh release create v1.32.5 --verify-tag --generate-notes
```

A GitHub prerelease uses the Marketplace prerelease channel. Keep the numeric version and select the GitHub prerelease option. The workflow uses `--pre-release` when packaging and publishing.

If Marketplace publishing fails, fix the secret or publisher access and rerun only the failed job. The VSIX remains downloadable from the GitHub release. Repeated Marketplace publication skips versions already published.

Microsoft documents retirement of global Azure DevOps PATs on December 1, 2026. Follow the [official authentication guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace) when migrating this workflow to Entra ID authentication.
