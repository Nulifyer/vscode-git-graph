# Git Graphity for Visual Studio Code

This is [the GitHub fork](https://github.com/Nulifyer/vscode-git-graph), maintained by [nulifyer](https://github.com/Nulifyer), derived from [Michael Hutchison's Git Graph](https://github.com/mhutchie/vscode-git-graph). It uses extension ID `nulifyer.git-graphity` and targets stable VS Code 1.141.0 or newer. The original attribution and license remain.

Explore your repository history and perform Git actions from the graph. Customize the view to suit your workflow.

![Upstream project demonstration](https://github.com/mhutchie/vscode-git-graph/raw/master/resources/demo.gif)

## Features

* Git Graphity View:
    * Display:
        * Local & Remote Branches
        * Local Refs: Heads, Tags & Remotes
        * Uncommitted Changes
    * Perform Git Actions (available by right clicking on a commit / branch / tag):
        * Create, Checkout, Delete, Fetch, Merge, Pull, Push, Rebase, Rename & Reset Branches
        * Add, Delete & Push Tags
        * Checkout, Cherry Pick, Drop, Merge & Revert Commits
        * Clean, Reset & Stash Uncommitted Changes
        * Apply, Create Branch From, Drop & Pop Stashes
        * View annotated tag details (name, email, date and message)
        * Copy commit hashes, and branch, stash & tag names to the clipboard
    * View commit details and file changes by clicking on a commit. On the Commit Details View you can:
        * View the Visual Studio Code Diff of any file change by clicking on it.
        * Open the current version of any file that was affected in the commit.
        * Copy the path of any file that was affected in the commit to the clipboard.
        * Click on any HTTP/HTTPS url in the commit body to open it in your default web browser.
    * Compare any two commits by clicking on a commit, and then CTRL/CMD clicking on another commit. On the Commit Comparison View you can:
        * View the Visual Studio Code Diff of any file change between the selected commits by clicking on it.
        * Open the current version of any file that was affected between the selected commits.
        * Copy the path of any file that was affected between the selected commits to the clipboard.
    * Code Review - Keep track of which files you have reviewed in the Commit Details & Comparison Views.
        * Code Review's can be performed on any commit, or between any two commits (not on Uncommitted Changes).
        * When a Code Review is started, all files needing to be reviewed are bolded. When you view the diff / open a file, it will then be un-bolded.
        * Code Reviews persist across Visual Studio Code sessions. They are automatically closed after 90 days of inactivity.
    * View uncommitted changes, and compare the uncommitted changes with any commit.
    * Hover over any commit vertex on the graph to see a tooltip indicating:
        * Whether the commit is included in the HEAD.
        * Which branches, tags and stashes include the commit. 
    * Filter the branches shown in Git Graphity using the 'Branches' dropdown menu. The options for filtering the branches are:
        * Show All branches
        * Select one or more branches to be viewed
        * Select from a user predefined array of custom glob patterns (by setting `git-graphity.customBranchGlobPatterns`)
    * Fetch from Remote(s) _(available on the top control bar)_
    * Find Widget allows you to quickly find one or more commits containing a specific phrase (in the commit message / date / author / hash, branch or tag names).
    * Repository Settings Widget:
        * Allows you to view, add, edit, delete, fetch & prune remotes of the repository.
        * Configure "Issue Linking" - Converts issue numbers in commit messages into hyperlinks, that open the issue in your issue tracking system.
        * Configure "Pull Request Creation" - Automates the opening and pre-filling of a Pull Request form, directly from a branches context menu.
            * Support for the publicly hosted Bitbucket, GitHub and GitLab Pull Request providers is built-in.
            * Custom Pull Request providers can be configured using the Extension Setting `git-graphity.customPullRequestProviders` (e.g. for use with privately hosted Pull Request providers). Information on how to configure custom providers is available [here](https://github.com/mhutchie/vscode-git-graph/wiki/Configuring-a-custom-Pull-Request-Provider).
        * Export your Git Graphity Repository Configuration to a file that can be committed in the repository. It allows others working in the same repository to automatically use the same Git Graphity configuration.
    * Keyboard Shortcuts (available in the Git Graphity View):
        * `CTRL/CMD + F`: Open the Find Widget.
        * `CTRL/CMD + H`: Scrolls the Git Graphity View to be centered on the commit referenced by HEAD.
        * `CTRL/CMD + R`: Refresh the Git Graphity View.
        * `CTRL/CMD + S`: Scrolls the Git Graphity View to the first (or next) stash in the loaded commits.
        * `CTRL/CMD + SHIFT + S`: Scrolls the Git Graphity View to the last (or previous) stash in the loaded commits.
        * When the Commit Details View is open on a commit:
            * `Up` / `Down`: The Commit Details View will be opened on the commit directly above or below it on the Git Graphity View.
            * `CTRL/CMD + Up` / `CTRL/CMD + Down`: The Commit Details View will be opened on its child or parent commit on the same branch.
                * If the Shift Key is also pressed (i.e. `CTRL/CMD + SHIFT + Up` / `CTRL/CMD + SHIFT + Down`), when branches or merges are encountered the alternative branch is followed.
        * `Enter`: Activate the focused button, or submit the primary dialog action when a text field is focused.
        * `Escape`: Closes the active dialog, context menu or the Commit Details View.
    * Resize the width of each column, and show/hide the Date, Author & Commit columns.
    * Common Emoji Shortcodes are automatically replaced with the corresponding emoji in commit messages (including all [gitmoji](https://gitmoji.carloscuesta.me/)). Custom Emoji Shortcode mappings can be defined in `git-graphity.customEmojiShortcodeMappings`.
* A broad range of configurable settings (e.g. graph style, branch colours, and more...). See the 'Extension Settings' section below for more information.
* "Git Graphity" launch button in the Status Bar
* "Git Graphity: View Git Graphity" launch command in the Command Palette

## History and repository workflows

Use the history icon for full-history search. The **More actions** menu contains file history, worktrees, visual rebase, operation status, and layout controls.

- Viewport rendering keeps table rows and graph elements limited to the visible area. Selected commits and comparison anchors remain available while scrolling.
- **Search history** searches commit subjects across all repository references. Filter by author, date, or file. A commit hash of at least seven characters opens that commit.
- **File history** follows renames from a branch, tag, or commit. Right-click a file in commit details to start from that revision.
- **Worktrees** lists related worktrees. Create one from an existing branch or commit, open it in another window, or remove it. Git refuses dirty or locked worktrees.
- **Visual rebase** prepares a plan for the current branch. Reorder commits and choose pick, reword, edit, squash, fixup, or drop. The visual planner supports linear ranges of 1–500 commits. Ranges containing merges use the existing terminal rebase workflow.
- **Operation status** shows rebase, merge, cherry-pick, and revert conflicts. Open VS Code's merge editor, stage resolved files, and continue or abort.
- **Layout** collapses unlabelled linear runs and pins branches selected from the repository. Use **Highlight selected ancestry** in **More actions** to emphasize a commit path. Merge points, references, and selected commits stay visible. Expand any collapsed group to inspect its commits.

Find and full-history search use fzf v2 scoring by default. Ordered letters can match across gaps. Contiguous matches and word boundaries affect ranking. Uppercase terms use case-sensitive matching. Exact text and regular expressions remain available.

Fuzzy queries support space-separated terms, `'exact`, `^prefix`, `suffix$`, `!exclude`, and `|` alternatives. Full-history results highlight matched characters. Use the arrow keys and Enter to select a result. Find searches loaded history, including collapsed commits. **Search history** also searches commits that the graph has not loaded.

Focus a commit row to use Up, Down, Home, and End. Enter opens details, and Shift+F10 opens its context menu. Context menus support arrow keys, Enter, and Escape. Rows expose commit summaries and their history positions to assistive technology. Long reference labels have full-name tooltips.

History data and topology remain in memory. Loading another page still fetches the requested history prefix. Virtualization bounds rendered elements, not all memory or Git work. Full-history search builds a reusable index on its first query; later queries reuse it until references change.

## Theme integration

The graph follows VS Code's Source Control Graph colors. Toolbar icons, dropdowns, reference labels, hover states, and controls use the active workbench theme. Changes apply while the graph is open.

Leave `git-graphity.graph.colours` empty to follow the theme. An explicitly configured palette overrides the graph colors. You can also customize the native `scmGraph.*` colors through `workbench.colorCustomizations`.

## Extension Settings

Detailed information of all Git Graphity settings is available [here](https://github.com/mhutchie/vscode-git-graph/wiki/Extension-Settings), including: descriptions, screenshots, default values and types.

A summary of the Git Graphity extension settings are:
* **Commit Details View**:
    * **Auto Center**: Automatically center the Commit Details View when it is opened.
    * **File View**:
        * **File Tree**:
            * **Compact Folders**: Render the File Tree in the Commit Details View in a compacted form, such that folders with a single child folder are compressed into a single combined folder element.
        * **Type**: Sets the default type of File View used in the Commit Details View.
    * **Location**: Specifies where the Commit Details View is rendered in the Git Graphity View.
* **Context Menu Actions Visibility**: Customise which context menu actions are visible. For more information, see the documentation [here](https://github.com/mhutchie/vscode-git-graph/wiki/Extension-Settings#context-menu-actions-visibility).
* **Custom Branch Glob Patterns**: An array of Custom Glob Patterns to be shown in the "Branches" dropdown. Example: `[{"name":"Feature Requests", "glob":"heads/feature/*"}]`
* **Custom Emoji Shortcode Mappings**: An array of custom Emoji Shortcode mappings. Example: `[{"shortcode": ":sparkles:", "emoji":"✨"}]`
* **Custom Pull Request Providers**: An array of custom Pull Request providers that can be used in the "Pull Request Creation" Integration. For information on how to configure this setting, see the documentation [here](https://github.com/mhutchie/vscode-git-graph/wiki/Configuring-a-custom-Pull-Request-Provider).
* **Date**:
    * **Format**: Specifies the date format to be used in the "Date" column on the Git Graphity View.
    * **Type**: Specifies the date type to be displayed in the "Date" column on the Git Graphity View, either the author or commit date.
* **Default Column Visibility**: An object specifying the default visibility of the Date, Author & Commit columns. Example: `{"Date": true, "Author": true, "Commit": true}`
* **Dialog > \***: Set the default options on the following dialogs: Add Tag, Apply Stash, Cherry Pick, Create Branch, Delete Branch, Fetch into Local Branch, Fetch Remote, Merge, Pop Stash, Pull Branch, Rebase, Reset, and Stash Uncommitted Changes
* **Enhanced Accessibility**: Visual file change A|M|D|R|U indicators in the Commit Details View for users with colour blindness. In the future, this setting will enable any additional accessibility related features of Git Graphity that aren't enabled by default.
* **File Encoding**: The character set encoding used when retrieving a specific version of repository files (e.g. in the Diff View). A list of all supported encodings can be found [here](https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings).
* **Graph**:
    * **Colours**: Specifies the colours used on the graph.
    * **Style**: Specifies the style of the graph.
    * **Uncommitted Changes**: Specifies how the Uncommitted Changes are displayed on the graph.
* **Integrated Terminal Shell**: Specifies the path and filename of the Shell executable to be used by the Visual Studio Code Integrated Terminal, when it is opened by Git Graphity.
* **Keyboard Shortcut > \***: Configures the keybindings used for all keyboard shortcuts in the Git Graphity View.
* **Markdown**: Parse and render a frequently used subset of inline Markdown formatting rules in commit messages and tag details (bold, italics, bold & italics, and inline code blocks).
* **Max Depth Of Repo Search**: Specifies the maximum depth of subfolders to search when discovering repositories in the workspace.
* **Open New Tab Editor Group**: Specifies the Editor Group where Git Graphity should open new tabs, when performing the following actions from the Git Graphity View: Viewing the Visual Studio Code Diff View, Opening a File, Viewing a File at a Specific Revision.
* **Open to the Repo of the Active Text Editor Document**: Open the Git Graphity View to the repository containing the active Text Editor document.
* **Reference Labels**:
    * **Alignment**: Specifies how branch and tag reference labels are aligned for each commit.
    * **Combine Local and Remote Branch Labels**: Combine local and remote branch labels if they refer to the same branch, and are on the same commit.
* **Repository**:
    * **Commits**:
        * **Fetch Avatars**: Fetch avatars of commit authors and committers.
        * **Initial Load**: Specifies the number of commits to initially load.
        * **Load More**: Specifies the number of additional commits to load when the "Load More Commits" button is pressed, or more commits are automatically loaded.
        * **Load More Automatically**: When the view has been scrolled to the bottom, automatically load more commits if they exist (instead of having to press the "Load More Commits" button).
        * **Mute**:
            * **Commits that are not ancestors of HEAD**: Display commits that aren't ancestors of the checked-out branch / commit with a muted text color.
            * **Merge Commits**: Display merge commits with a muted text color.
        * **Order**: Specifies the order of commits on the Git Graphity View. See [git log](https://git-scm.com/docs/git-log#_commit_ordering) for more information on each order option.
        * **Show Signature Status**: Show the commit's signature status to the right of the Committer in the Commit Details View (only for signed commits). Hovering over the signature icon displays a tooltip with the signature details.
    * **Fetch and Prune**: Before fetching from remote(s) using the Fetch button on the Git Graphity View Control Bar, remove any remote-tracking references that no longer exist on the remote(s).
    * **Fetch And Prune Tags**: Before fetching from remote(s) using the Fetch button on the Git Graphity View Control Bar, remove any local tags that no longer exist on the remote(s).
    * **Include Commits Mentioned By Reflogs**: Include commits only mentioned by reflogs in the Git Graphity View (only applies when showing all branches).
    * **On Load**:
        * **Scroll To Head**: Automatically scroll the Git Graphity View to be centered on the commit referenced by HEAD.
        * **Show Checked Out Branch**: Show the checked out branch when a repository is loaded in the Git Graphity View.
        * **Show Specific Branches**: Show specific branches when a repository is loaded in the Git Graphity View.
    * **Only Follow First Parent**: Only follow the first parent of commits when discovering the commits to load in the Git Graphity View. See [--first-parent](https://git-scm.com/docs/git-log#Documentation/git-log.txt---first-parent) to find out more about this setting.
    * **Show Commits Only Referenced By Tags**: Show Commits that are only referenced by tags in Git Graphity.
    * **Show Remote Branches**: Show Remote Branches in Git Graphity by default.
    * **Show Remote Heads**: Show Remote HEAD Symbolic References in Git Graphity.
    * **Show Stashes**: Show Stashes in Git Graphity by default.
    * **Show Tags**: Show Tags in Git Graphity by default.
    * **Show Uncommitted Changes**: Show uncommitted changes. If you work on large repositories, disabling this setting can reduce the load time of the Git Graphity View.
    * **Show Untracked Files**: Show untracked files when viewing the uncommitted changes. If you work on large repositories, disabling this setting can reduce the load time of the Git Graphity View.
    * **Sign**:
        * **Commits**: Enables commit signing with GPG or X.509.
        * **Tags**: Enables tag signing with GPG or X.509.
    * **Use Mailmap**: Respect [.mailmap](https://git-scm.com/docs/git-check-mailmap#_mapping_authors) files when displaying author & committer names and email addresses.
* **Repository Dropdown Order**: Specifies the order that repositories are sorted in the repository dropdown on the Git Graphity View (only visible when more than one repository exists in the current Visual Studio Code Workspace).
* **Retain Context When Hidden**: Specifies if the Git Graphity view Visual Studio Code context is kept when the panel is no longer visible (e.g. moved to background tab). Enabling this setting will make Git Graphity load significantly faster when switching back to the Git Graphity tab, however has a higher memory overhead.
* **Show Status Bar Item**: Show a Status Bar Item that opens the Git Graphity View when clicked.
* **Source Code Provider Integration Location**: Specifies where the "View Git Graphity" action appears on the title of SCM Providers.
* **Tab Icon Colour Theme**: Specifies the colour theme of the icon displayed on the Git Graphity tab.

This extension consumes the following settings:

* `git.path`: Specifies the path and filename of a portable Git installation.

## Extension Commands

This extension contributes the following commands:

* `git-graphity.view`: Git Graphity: View Git Graphity
* `git-graphity.addGitRepository`: Git Graphity: Add Git Repository... _(used to add sub-repos to Git Graphity)_
* `git-graphity.clearAvatarCache`: Git Graphity: Clear Avatar Cache
* `git-graphity.endAllWorkspaceCodeReviews`: Git Graphity: End All Code Reviews in Workspace
* `git-graphity.endSpecificWorkspaceCodeReview`: Git Graphity: End a specific Code Review in Workspace... _(used to end a specific Code Review without having to first open it in the Git Graphity View)_
* `git-graphity.fetch`: Git Graphity: Fetch from Remote(s) _(used to open the Git Graphity View and immediately run "Fetch from Remote(s)")_
* `git-graphity.removeGitRepository`: Git Graphity: Remove Git Repository... _(used to remove repositories from Git Graphity)_
* `git-graphity.resumeWorkspaceCodeReview`: Git Graphity: Resume a specific Code Review in Workspace... _(used to open the Git Graphity View to a Code Review that is already in progress)_
* `git-graphity.version`: Git Graphity: Get Version Information

## Release Notes

Fork release notes are recorded in the bundled CHANGELOG.md. [Upstream release history](https://github.com/mhutchie/vscode-git-graph/blob/d7f43f4/CHANGELOG.md) covers the original versions.

## Installation

Git Graphity uses its own command IDs, settings namespace, diff URI scheme, and repository configuration file `.vscode/vscode-git-graphity.json`. Previous extension settings and saved state do not transfer automatically.

Install Git Graphity using extension ID `nulifyer.git-graphity`:

```bash
code --install-extension nulifyer.git-graphity
```

For local installation, build the VSIX using the commands below. Installed users do not need Bun.

To build and install from source:

```bash
bun run package
code --install-extension ./git-graphity-1.32.4.vsix --force
```

Fully quit VS Code and reopen it after replacing the extension. Upstream wiki links below document the inherited functionality. Use [the fork repository](https://github.com/Nulifyer/vscode-git-graph) and [its issue tracker](https://github.com/Nulifyer/vscode-git-graph/issues) for this build.

## Webview startup troubleshooting

If VS Code reports `Could not register service worker: InvalidStateError`, fully quit all VS Code windows and reopen the editor. This matches a [VS Code/Chromium webview issue](https://github.com/microsoft/vscode/issues/125993).

If a full restart does not resolve it, quit VS Code before backing up its service-worker cache. On this Linux installation, the directory is `~/.config/Code/Service Worker`. Move that directory to a uniquely named backup, then start VS Code again. Do not move the cache while VS Code is running. Keep the backup until the graph works.

The isolated extension-host test uses a temporary profile and confirms that the packaged webview can load independently of existing profile state. It does not establish that a user's existing cache is corrupt.

## Acknowledgements

Thank you to all of the contributors that help with the development of Git Graphity!

Some of the icons used in Git Graphity are from the following sources, please support them for their excellent work!
- [GitHub Octicons](https://octicons.github.com/) ([License](https://github.com/primer/octicons/blob/master/LICENSE))
- [Icons8](https://icons8.com/icon/pack/free-icons/ios11) ([License](https://icons8.com/license))