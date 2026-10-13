/** Repository workflows use their own request IDs and never infer success from a click. */
class RepositoryWorkbench {
	private nextRequest = 0;
	private readonly pending = new Map<number, { repo: string; resolve: (result: GG.RepositoryToolResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
	private modal: HTMLDialogElement | null = null;
	private readonly banner: HTMLElement;
	private lastRepo: string | null = null;
	private syncing = false;

	constructor(private readonly view: GitGraphityView) {
		this.lastRepo = view.getCurrentRepository();
		const toolbar = document.createElement('div');
		toolbar.className = 'workflowToolbar';
		toolbar.setAttribute('role', 'toolbar');
		toolbar.setAttribute('aria-label', 'Graph actions');
		const controls = document.getElementById('controls')!;
		for (const id of ['findBtn', 'terminalBtn', 'settingsBtn', 'fetchBtn', 'refreshBtn']) toolbar.append(document.getElementById(id)!);
		const search = this.iconButton('Search history', SVG_ICONS.history, () => this.search()); search.id = 'historySearchBtn';
		const more = this.iconButton('More actions', SVG_ICONS.ellipsis, () => {}); more.id = 'workflowMoreBtn';
		more.setAttribute('aria-haspopup', 'menu');
		more.addEventListener('click', event => {
			event.stopPropagation();
			const bounds = more.getBoundingClientRect();
			contextMenu.show([
				[{ title: 'File history…', visible: true, onClick: () => this.search(true) }, { title: 'Worktrees…', visible: true, onClick: () => { this.worktrees().catch(error => this.error(error)); } }, { title: 'Visual rebase…', visible: true, onClick: () => this.rebase() }],
				[{ title: 'Layout…', visible: true, onClick: () => this.layout() }, { title: 'Highlight selected ancestry', visible: true, onClick: () => this.view.highlightPath(this.view.getSelectedHash()) }, { title: 'Clear path highlight', visible: this.view.isPathHighlighted(), onClick: () => this.view.highlightPath(null) }],
				[{ title: 'Operation status', visible: true, onClick: () => this.sync() }]
			], false, null, new MouseEvent('contextmenu', { clientX: bounds.right, clientY: bounds.bottom }), document.getElementById('view')!, () => more.focus(), 'workflowMenu');
		});
		toolbar.insertBefore(search, toolbar.firstChild);
		toolbar.append(more); controls.append(toolbar);
		this.banner = document.createElement('div');
		this.banner.className = 'operationBanner';
		this.banner.setAttribute('role', 'status');
		this.banner.hidden = true;
		document.getElementById('controls')!.append(this.banner);
		window.addEventListener('git-graphity:file-history', event => {
			const detail = (event as CustomEvent<{ file: string; reference: string }>).detail;
			this.search(true, detail.file, detail.reference);
		});
		setInterval(() => { if (!document.hidden) this.sync(); }, 5000);
	}

	public receive(message: GG.ResponseRepositoryTool) {
		const request = this.pending.get(message.requestId);
		if (!request || request.repo !== message.repo) return;
		clearTimeout(request.timer);
		this.pending.delete(message.requestId);
		if (message.error !== null || message.result === null) request.reject(new Error(message.error || 'No workflow result'));
		else request.resolve(message.result);
	}

	private request(tool: GG.RepositoryToolAction): Promise<GG.RepositoryToolResult> {
		const repo = this.view.getCurrentRepository();
		if (!repo) return Promise.reject(new Error('Open a repository first'));
		return new Promise((resolve, reject) => {
			const requestId = ++this.nextRequest;
			const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Git did not respond. Refresh operation status before retrying.')); }, 180000);
			this.pending.set(requestId, { repo, resolve, reject, timer });
			sendMessage({ command: 'repositoryTool', repo, requestId, tool });
		});
	}

	private button(label: string, action: () => void | Promise<void>, variant: 'secondary' | 'primary' | 'text' = 'secondary') {
		const button = document.createElement('button');
		button.type = 'button'; button.textContent = label; button.className = 'workflowButton ' + variant;
		button.addEventListener('click', async () => { button.disabled = true; try { await action(); } catch (error) { this.error(error); } finally { button.disabled = false; } });
		return button;
	}

	private iconButton(label: string, icon: string, action: () => void | Promise<void>) {
		const button = this.button(label, action);
		button.className = 'workflowIcon'; button.title = label; button.setAttribute('aria-label', label); button.innerHTML = icon;
		button.querySelector('svg')?.setAttribute('aria-hidden', 'true');
		return button;
	}

	private confirm(message: string): Promise<boolean> {
		return new Promise(resolve => {
			const modal = document.createElement('dialog'); modal.className = 'modernDialog confirmDialog';
			const text = document.createElement('p'); text.className = 'workflowConfirmation'; text.textContent = message;
			const footer = document.createElement('div'); footer.className = 'workflowFooter';
			footer.append(this.button('Cancel', () => modal.close()), this.button('Confirm', () => modal.close('confirm'), 'primary'));
			modal.append(text, footer); modal.setAttribute('aria-label', 'Confirm Git action');
			modal.addEventListener('keydown', event => event.stopPropagation());
			modal.addEventListener('close', () => { resolve(modal.returnValue === 'confirm'); modal.remove(); }, { once: true });
			document.body.append(modal); modal.showModal();
		});
	}

	private error(error: unknown) {
		const target = this.modal?.querySelector('.workflowStatus') ?? this.banner;
		target.textContent = error instanceof Error ? error.message : String(error);
		target.setAttribute('data-kind', 'error');
		if (target === this.banner) this.banner.hidden = false;
	}

	private dialog(title: string, kind: string, description = '') {
		this.modal?.close(); this.modal?.remove();
		const modal = document.createElement('dialog'); modal.className = 'modernDialog'; modal.dataset.view = kind;
		const header = document.createElement('header'); header.className = 'workflowHeader';
		const heading = document.createElement('h2'); heading.textContent = title; heading.id = 'workflowTitle';
		const titles = document.createElement('div'); titles.append(heading);
		if (description) { const subtitle = document.createElement('p'); subtitle.textContent = description; titles.append(subtitle); }
		header.append(titles, this.iconButton('Close', SVG_ICONS.close, () => modal.close()));
		modal.setAttribute('aria-labelledby', heading.id);
		const status = document.createElement('div'); status.className = 'workflowStatus'; status.setAttribute('role', 'status');
		const body = document.createElement('div'); body.className = 'workflowBody';
		const footer = document.createElement('footer'); footer.className = 'workflowFooter'; footer.append(this.button('Close', () => modal.close()));
		modal.append(header, body, status, footer);
		modal.addEventListener('keydown', event => event.stopPropagation());
		modal.addEventListener('close', () => { modal.remove(); if (this.modal === modal) this.modal = null; });
		document.body.append(modal); this.modal = modal; modal.showModal();
		queueMicrotask(() => body.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus());
		return { modal, body, status, footer };
	}

	private value(parent: HTMLElement, name: string) { return (parent.querySelector('[name="' + name + '"]') as HTMLInputElement).value; }

	private search(follow = false, file = '', reference = 'HEAD') {
		const { modal, body, status } = this.dialog(follow ? 'File history' : 'Search history', 'search', follow ? 'Follow a file across renames.' : 'Search commits across the repository.');
		const form = document.createElement('form'); form.className = 'historySearchForm';
		form.innerHTML = '<div class="searchQueryRow"><label>Commit message or hash<input name="query" placeholder="Commit message or hash…" autocomplete="off"></label><label>Match<select name="mode"><option value="fuzzy">Fuzzy (fzf)</option><option value="exact">Exact text</option><option value="regex">Regular expression</option></select></label><button type="submit" class="workflowButton primary">Search</button></div><details class="searchFilters"><summary>Filter commits</summary><div class="workflowFields"><label>Author<input name="author"></label><label>Since<input name="since" type="date"></label><label>Until<input name="until" type="date"></label><label>File path<input name="file" placeholder="Repository-relative path"></label>' + (follow ? '<label>From branch, tag or commit<input name="reference" value="HEAD"></label>' : '') + '</div></details>';
		(form.querySelector('[name=file]') as HTMLInputElement).value = file;
		if (follow) { (form.querySelector('details') as HTMLDetailsElement).open = true; (form.querySelector('[name=file]') as HTMLInputElement).required = true; }
		if (follow) (form.querySelector('[name=reference]') as HTMLInputElement).value = reference;
		const hint = document.createElement('p'); hint.className = 'workflowHint'; hint.textContent = 'Fuzzy matching by default. Use \'exact, ^prefix or !exclude to narrow results.';

		const results = document.createElement('div'); results.className = 'historyResults';
		let offset = 0, generation = 0;
		const load = async () => {
			const current = ++generation;
			status.removeAttribute('data-kind'); status.textContent = 'Searching…';
			const result = await this.request({ kind: 'search', query: this.value(form, 'query'), mode: this.value(form, 'mode') as 'fuzzy' | 'exact' | 'regex', author: this.value(form, 'author'), since: this.value(form, 'since'), until: this.value(form, 'until'), file: this.value(form, 'file'), follow, reference: follow ? this.value(form, 'reference') : undefined, offset });
			if (this.modal !== modal || current !== generation || result.kind !== 'history') return;
			results.replaceChildren();
			status.textContent = result.entries.length ? 'Results ' + (offset + 1) + '–' + (offset + result.entries.length) : 'No matching commits';
			for (const entry of result.entries) {
				const row = document.createElement('div'); row.className = 'historyResult';
				const button = this.button(entry.subject, () => { modal.close(); this.view.showHistoryFromCommit(entry.hash); }); button.className = 'historyResultButton';
				const subject = document.createElement('span'); subject.className = 'historyResultSubject';
				const positions = new Set(entry.positions || []);
				for (let i = 0; i < entry.subject.length;) {
					const start = i++, matched = positions.has(start);
					while (i < entry.subject.length && positions.has(i) === matched) i++;
					const span = document.createElement('span'); span.textContent = entry.subject.slice(start, i); if (matched) span.className = 'fuzzyMatch'; subject.append(span);
				}
				const meta = document.createElement('span'); meta.className = 'historyResultMeta'; meta.textContent = entry.author + '  ' + formatShortDate(entry.date).formatted;
				const hash = document.createElement('span'); hash.className = 'historyResultHash'; hash.textContent = abbrevCommit(entry.hash);
				button.replaceChildren(subject, hash, meta);

				row.append(button);
				results.append(row);
			}
			const pages = document.createElement('div'); pages.className = 'historyPagination';
			if (offset) pages.append(this.button('Previous 100', async () => { offset = Math.max(0, offset - 100); await load(); }));
			if (result.more) pages.append(this.button('Next 100', async () => { offset += 100; await load(); }));
			if (pages.children.length) results.append(pages);
		};
		let debounce: ReturnType<typeof setTimeout> | null = null;
		const search = () => { if (debounce !== null) clearTimeout(debounce); offset = 0; load().catch(error => { if (this.modal === modal) this.error(error); }); };
		form.addEventListener('submit', event => { event.preventDefault(); search(); });
		form.addEventListener('input', () => { generation++; if (debounce !== null) clearTimeout(debounce); debounce = setTimeout(search, 180); });
		modal.addEventListener('close', () => { generation++; if (debounce !== null) clearTimeout(debounce); });
		form.addEventListener('keydown', event => {
			if (event.key === 'ArrowDown' && event.target instanceof HTMLInputElement && results.firstElementChild) { (results.querySelector('button') as HTMLButtonElement)?.focus(); event.preventDefault(); }
		});
		results.addEventListener('keydown', event => {
			if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
			const buttons = [...results.querySelectorAll('button')], index = buttons.indexOf(event.target as HTMLButtonElement);
			if (index < 0) return;
			buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus(); event.preventDefault();
		});
		body.append(form, hint, results);
		if (follow && file) load().catch(error => this.error(error));
	}

	private layout() {
		const { modal, body, footer } = this.dialog('Graph layout', 'layout');
		const config = this.view.getLayout(), form = document.createElement('form'); form.id = 'graphLayoutForm'; form.className = 'layoutForm';
		form.innerHTML = '<label class="workflowCheck"><input name="collapsed" type="checkbox"><span class="customCheckbox" aria-hidden="true"></span><span>Collapse linear history</span></label><p class="workflowHint">Keep references, merge points and selected commits visible.</p><div class="workflowField"><label for="pinnedBranchPicker">Pinned branch lanes</label><div class="branchPickerRow"><select id="pinnedBranchPicker" name="branch"><option value="">Select a branch…</option></select></div><div class="pinnedBranchList"></div><input type="hidden" name="pins"><p class="workflowHint">Pinned branches keep a fixed lane and color.</p></div>';
		(form.querySelector('[name=collapsed]') as HTMLInputElement).checked = config.collapsed;
		const pins = [...config.pinnedBranches], picker = form.querySelector<HTMLSelectElement>('[name=branch]')!, list = form.querySelector<HTMLElement>('.pinnedBranchList')!;
		const renderPins = () => {
			list.replaceChildren(); picker.replaceChildren();
			const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Select a branch…'; picker.append(placeholder);
			for (const branch of this.view.getAvailableBranches()) if (!pins.includes(branch)) { const option = document.createElement('option'); option.value = branch; option.textContent = branch; picker.append(option); }
			for (const branch of pins) {
				const row = document.createElement('div'); row.className = 'pinnedBranchRow';
				const name = document.createElement('span'); name.textContent = branch;
				row.append(name, this.iconButton('Unpin ' + branch, SVG_ICONS.close, () => { pins.splice(pins.indexOf(branch), 1); renderPins(); picker.focus(); })); list.append(row);
			}
			(form.querySelector('[name=pins]') as HTMLInputElement).value = pins.join('\n'); picker.disabled = pins.length >= 12;
		};
		picker.addEventListener('change', () => { if (picker.value) { pins.push(picker.value); renderPins(); } }); renderPins();
		form.addEventListener('submit', event => { event.preventDefault(); this.view.configureLayout((form.querySelector('[name=collapsed]') as HTMLInputElement).checked, pins); modal.close(); });
		const apply = document.createElement('button'); apply.type = 'submit'; apply.textContent = 'Apply layout'; apply.className = 'workflowButton primary'; apply.setAttribute('form', form.id);
		footer.replaceChildren(this.button('Cancel', () => modal.close()), apply); body.append(form);
	}

	private async worktrees() {
		const { modal, body, status } = this.dialog('Worktrees', 'worktrees', 'Use separate folders for parallel branches.');
		const list = document.createElement('div'); body.append(list);
		const render = async () => {
			const result = await this.request({ kind: 'worktrees' });
			if (this.modal !== modal || result.kind !== 'worktrees') return;
			list.replaceChildren(); status.removeAttribute('data-kind'); status.textContent = result.worktrees.length + ' worktrees';
			for (const tree of result.worktrees) {
				const row = document.createElement('div'); row.className = 'worktreeRow';
				const label = document.createElement('div'); label.className = 'worktreeInfo';
				const name = document.createElement('strong'); name.textContent = tree.branch || 'Detached ' + abbrevCommit(tree.head);
				const location = document.createElement('span'); location.textContent = tree.path; location.title = tree.path;
				label.append(name, location);
				if (tree.main || tree.locked) { const badge = document.createElement('span'); badge.className = 'workflowBadge'; badge.textContent = tree.main ? 'Main' : 'Locked'; label.append(badge); }
				row.append(label, this.iconButton('Open in new window', SVG_ICONS.openFile, async () => { await this.request({ kind: 'openWorktree', path: tree.path }); }));
				if (!tree.main) row.append(this.iconButton('Remove', SVG_ICONS.trash, async () => {
					if (!await this.confirm('Remove this worktree? Git will refuse if it is dirty or locked.\n' + tree.path)) return;
					await this.request({ kind: 'removeWorktree', path: tree.path }); await render(); this.view.refresh(false);
				}));
				list.append(row);
			}
		};
		const form = document.createElement('form'); form.className = 'worktreeCreateForm'; form.innerHTML = '<h3>Create worktree</h3><div class="workflowFields"><label>Directory<input name="path" required placeholder="Directory for the new worktree"></label><label>Branch, tag or commit<input name="reference" required placeholder="Existing branch or commit"></label></div><button type="submit" class="workflowButton primary">Create worktree</button>';
		form.addEventListener('submit', event => {
			event.preventDefault();
			const submit = form.querySelector('button')!; submit.disabled = true; status.textContent = 'Creating worktree…';
			this.request({ kind: 'addWorktree', path: this.value(form, 'path'), reference: this.value(form, 'reference') }).then(() => render()).catch(error => this.error(error)).finally(() => { submit.disabled = false; });
		});
		body.append(form); await render();
	}

	private rebase() {
		const { modal, body, status, footer } = this.dialog('Interactive rebase', 'rebase', 'Reorder commits and choose how to apply each one.');
		const form = document.createElement('form'); form.className = 'rebaseBaseForm'; form.innerHTML = '<label>Rebase current branch onto<input name="base" value="HEAD~5" required></label><button type="submit" class="workflowButton secondary">Prepare plan</button>';
		const editor = document.createElement('div'); body.append(form, editor);
		form.addEventListener('submit', event => {
			event.preventDefault(); status.removeAttribute('data-kind'); status.textContent = 'Preparing plan…';
			this.request({ kind: 'rebasePlan', base: this.value(form, 'base') }).then(result => {
				if (this.modal !== modal || result.kind !== 'plan') return;
				const plan = result.plan;
				status.textContent = plan.entries.length + ' commits on ' + plan.branch + '. Oldest first.';
				const render = (focusHash?: string) => {
					editor.replaceChildren();
					for (let i = 0; i < plan.entries.length; i++) {
						const entry = plan.entries[i], row = document.createElement('div'); row.className = 'rebaseRow'; row.dataset.hash = entry.hash; row.draggable = true;
						row.addEventListener('dragstart', event => event.dataTransfer?.setData('text/plain', i.toString()));
						row.addEventListener('dragover', event => event.preventDefault());
						row.addEventListener('drop', event => { event.preventDefault(); const from = Number(event.dataTransfer?.getData('text/plain')); if (Number.isInteger(from) && from >= 0 && from < plan.entries.length) { const moved = plan.entries.splice(from, 1)[0]; plan.entries.splice(i, 0, moved); render(); } });
						const title = document.createElement('span'); title.className = 'rebaseSubject'; title.textContent = entry.subject; title.title = entry.subject;
						const hash = document.createElement('span'); hash.className = 'rebaseHash'; hash.textContent = abbrevCommit(entry.hash);
						const action = document.createElement('select'); action.setAttribute('aria-label', 'Action for ' + entry.subject);
						for (const name of ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']) { const option = document.createElement('option'); option.value = name; option.textContent = name; action.append(option); }
						action.value = entry.action; action.addEventListener('change', () => { if (action.value === 'squash' && entry.action !== 'squash') { const previous = plan.entries.slice(0, i).findLast(entry => entry.action !== 'drop'); if (previous) entry.message = (previous.message || previous.subject) + '\n\n' + (entry.message || entry.subject); } entry.action = action.value as GG.RebaseEntry['action']; render(entry.hash); });
						row.append(action, title, hash);
						if (i) row.append(this.iconButton('Move up', SVG_ICONS.arrowUp, () => { [plan.entries[i - 1], plan.entries[i]] = [plan.entries[i], plan.entries[i - 1]]; render(entry.hash); }));
						if (i + 1 < plan.entries.length) row.append(this.iconButton('Move down', SVG_ICONS.arrowDown, () => { [plan.entries[i], plan.entries[i + 1]] = [plan.entries[i + 1], plan.entries[i]]; render(); }));
						if (entry.action === 'reword' || entry.action === 'squash') { const message = document.createElement('textarea'); message.setAttribute('aria-label', 'New commit message'); message.value = entry.message || entry.subject; message.addEventListener('input', () => { entry.message = message.value; }); entry.message = message.value; row.append(message); }
						editor.append(row);
					}
					const start = this.button('Start rebase', async () => {
						if (!await this.confirm('Rewrite these commits on ' + plan.branch + '? Published commit IDs will change. Review the actions before continuing.')) return;
						start.disabled = true;
						try { const result = await this.request({ kind: 'runRebase', id: plan.id, entries: plan.entries }); if (result.kind === 'operation') this.showOperation(result.state); modal.close(); this.view.refresh(false); } finally { start.disabled = false; }
					}, 'primary'); footer.replaceChildren(this.button('Cancel', () => modal.close()), start);
					if (focusHash) editor.querySelector<HTMLSelectElement>('[data-hash="' + focusHash + '"] select')?.focus();
				}; render();
			}).catch(error => this.error(error));
		});
	}

	public sync() {
		const repo = this.view.getCurrentRepository(); if (!repo || this.syncing) return;
		this.syncing = true;
		if (this.lastRepo !== repo) { this.lastRepo = repo; this.modal?.close(); }
		this.request({ kind: 'operation' }).then(result => { if (repo === this.view.getCurrentRepository() && result.kind === 'operation') this.showOperation(result.state); }).catch(error => this.error(error)).finally(() => { this.syncing = false; });
	}

	private showOperation(state: GG.OperationState) {
		this.banner.removeAttribute('data-kind');
		this.banner.replaceChildren(); this.banner.hidden = state.operation === null && !state.conflicts.length;
		if (this.banner.hidden) return;
		const summary = document.createElement('p'); summary.textContent = (state.operation || 'Git') + ' · ' + state.conflicts.length + ' unresolved files' + (state.warning ? ' · ' + state.warning : '');
		this.banner.append(summary);
		for (const file of state.conflicts) {
			const row = document.createElement('div'); row.className = 'conflictFileRow'; const label = document.createElement('span'); label.textContent = file; label.title = file;
			row.append(label, this.button('Open merge editor', async () => { await this.request({ kind: 'openConflict', file }); }), this.button('Mark resolved and stage', async () => { const result = await this.request({ kind: 'stageConflict', file }); if (result.kind === 'operation') this.showOperation(result.state); })); this.banner.append(row);
		}
		if (state.operation) {
			const next = this.button('Continue ' + state.operation, async () => { const result = await this.request({ kind: 'continue' }); if (result.kind === 'operation') this.showOperation(result.state); this.view.refresh(false); }); next.disabled = state.conflicts.length > 0;
			const abort = this.button('Abort ' + state.operation, async () => { if (!await this.confirm('Abort the current ' + state.operation + '?')) return; const result = await this.request({ kind: 'abort' }); if (result.kind === 'operation') this.showOperation(result.state); this.view.refresh(false); });
			next.classList.add('primary'); this.banner.append(next, abort);
		}
	}
}
