# Contributing to Git Graphity

Use the [issue tracker](https://github.com/Nulifyer/vscode-git-graph/issues) for bugs, questions, and feature proposals. Describe the behavior you want to change before starting a large contribution.

## Set up

Use Bun 1.4.3, Node 24 or newer, Git, and VS Code 1.141.0 or newer.

```bash
bun install --frozen-lockfile
bun run check
```

Bun handles installation and builds. The extension runs in VS Code's Node extension host. Keep dependency versions pinned and include lockfile updates when changing dependencies.

## Build and debug

```bash
bun run compile
```

Press F5 in VS Code to open an Extension Development Host. Use `bun run compile-web-debug` and **Developer: Open Webview Developer Tools** to inspect the frontend.

To build and install a local VSIX:

```bash
bun run package-and-install
```

Git Graphity uses the `git-graphity` command and settings namespace. Repository configuration lives in `.vscode/vscode-git-graphity.json`. Earlier extension identities have separate settings and saved state.

## Validate a change

Run the checks that cover the changed behavior:

| Command | Checks |
| --- | --- |
| `bun run lint` | Source, test, frontend, and build-script lint rules |
| `bun run typecheck` | TypeScript types across all packages |
| `bun run test -- tests/<owner>.test.ts` | A focused unit suite |
| `bun run check` | Production build and the full unit suite |
| `bun run test-extension-host` | Activation, rendered history, commit details, and live theme changes |
| `bun run test-history-workflows` | Search, file history, comparisons, reviews, worktrees, and rebase workflows |
| `bun run package` | Installable VSIX generation |

The host checks use disposable repositories and profiles. Linux needs a graphical display; CI runs them with `xvfb-run`. Set `VSCODE_EXECUTABLE_PATH` to the VS Code executable to use an installed version. Otherwise, the harness downloads the manifest's target version.

To test a packaged extension, set `EXTENSION_UNDER_TEST` to its extracted `extension` directory and run the test script directly. The compile wrapper clears `.build`.

```bash
EXTENSION_UNDER_TEST=/path/to/extracted/extension bun scripts/test-extension-host.ts
EXTENSION_UNDER_TEST=/path/to/extracted/extension bun scripts/test-history-workflows.ts
```

For a custom theme, set `VSCODE_TEST_THEME_EXTENSION` to its extension directory and `VSCODE_TEST_THEME_NAME` to its theme ID. Set `VSCODE_TEST_GRAPH_COLOURS` to a JSON array to check an explicit graph palette. These settings affect only the temporary test profile.

## Submit a change

Explain the problem, the resulting behavior, and the checks you ran. Add regression coverage for behavior changes. Review the package contents when changing resources, runtime paths, or packaging rules.

Keep credentials, generated packages, and local configuration out of commits. Preserve license notices and follow the [code of conduct](CODE_OF_CONDUCT.md).

## Release

Update `package.json` and `CHANGELOG.md`, then commit the release changes. Use a new numeric version and keep existing published tags intact.

```bash
release_tag="v$(node -p 'require("./package.json").version')"
git tag -a "$release_tag" -m "Git Graphity ${release_tag#v}"
git push origin develop "$release_tag"
gh release create "$release_tag" --repo Nulifyer/vscode-git-graph --verify-tag --generate-notes
```

Publishing the GitHub release starts the `Release` workflow. The tag must match the committed manifest version. A GitHub prerelease uses the Marketplace prerelease channel.

The workflow checks Node 24 and 26, builds one VSIX, and tests that extracted package in VS Code. It attaches the verified VSIX and SHA-256 checksum to the GitHub release. Marketplace publication downloads those assets, verifies the checksum, and publishes the same file.

The Marketplace step uses the repository secret `VSCE_PAT`. Enter a publisher credential through the hidden CLI prompt:

```bash
gh secret set VSCE_PAT --repo Nulifyer/vscode-git-graph
```

GitHub release uploads use the automatic `GITHUB_TOKEN`. If publication fails, inspect the failed job before retrying it. A successful upload does not establish that Marketplace validation or indexing is complete.
