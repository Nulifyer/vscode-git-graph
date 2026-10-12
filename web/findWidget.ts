const CLASS_FIND_CURRENT_COMMIT = 'findCurrentCommit';
const CLASS_FIND_MATCH = 'findMatch';

interface FindWidgetState {
	readonly text: string;
	readonly currentHash: string | null;
	readonly visible: boolean;
	readonly fuzzy?: boolean;
}

/**
 * Implements the Git Graph View's Find Widget.
 */
class FindWidget {
	private readonly view: GitGraphView;
	private text: string = '';
	private matches: { hash: string, elem: HTMLElement | null }[] = [];
	private position: number = -1;
	private visible: boolean = false;
	private fuzzy = true;
	private byHash = new Map<string, { hash: string; elem: HTMLElement | null }>();
	private visibleMatches: { hash: string; elem: HTMLElement | null }[] = [];
	private activeCache: unknown = null;
	private searchGeneration = 0;
	private searchAbort: AbortController | null = null;
	private searchIndex: { commits: ReadonlyArray<GG.GitCommit>; key: string; index: InstanceType<typeof HistorySearch<GG.GitCommit>> } | null = null;
	private matchCache: { commits: ReadonlyArray<GG.GitCommit>; key: string; promise: Promise<string[]> } | null = null;

	private readonly widgetElem: HTMLElement;
	private readonly inputElem: HTMLInputElement;
	private readonly caseSensitiveElem: HTMLElement;
	private readonly regexElem: HTMLElement;
	private readonly positionElem: HTMLElement;
	private readonly prevElem: HTMLElement;
	private readonly nextElem: HTMLElement;

	/**
	 * Construct a new FindWidget instance.
	 * @param view The Git Graph View that the FindWidget is for.
	 * @returns The FindWidget instance.
	 */
	constructor(view: GitGraphView) {
		this.view = view;
		this.widgetElem = document.createElement('div');
		this.widgetElem.className = 'findWidget';
		this.widgetElem.innerHTML = '<span class="findInputGroup"><input id="findInput" type="text" placeholder="Find" disabled/><span id="findCaseSensitive" class="findModifier" title="Match Case">Aa</span><span id="findRegex" class="findModifier" title="Use Regular Expression">.*</span></span><button id="findFuzzy" type="button" title="fzf fuzzy ranking and extended query syntax" aria-pressed="true">Fuzzy</button><span id="findPosition" role="status"></span><span id="findPrev" title="Previous match (Shift+Enter)"></span><span id="findNext" title="Next match (Enter)"></span><span id="findOpenCdv" title="Open the Commit Details View for the current match"></span><span id="findClose" title="Close (Escape)"></span>';
		document.body.appendChild(this.widgetElem);

		this.inputElem = <HTMLInputElement>document.getElementById('findInput')!;
		let keyupTimeout: ReturnType<typeof setTimeout> | null = null;
		this.inputElem.addEventListener('keyup', (e) => {
			if ((e.keyCode ? e.keyCode === 13 : e.key === 'Enter') && this.text !== '') {
				if (e.shiftKey) {
					this.prev();
				} else {
					this.next();
				}
				handledEvent(e);
			} else {
				if (keyupTimeout !== null) clearTimeout(keyupTimeout);
				keyupTimeout = setTimeout(() => {
					keyupTimeout = null;
					if (this.text !== this.inputElem.value) {
						this.text = this.inputElem.value;
						this.clearMatches();
						this.findMatches(this.getCurrentHash(), true);
					}
				}, 200);
			}
		});

		this.caseSensitiveElem = document.getElementById('findCaseSensitive')!;
		alterClass(this.caseSensitiveElem, CLASS_ACTIVE, workspaceState.findIsCaseSensitive);
		this.caseSensitiveElem.addEventListener('click', () => {
			updateWorkspaceViewState('findIsCaseSensitive', !workspaceState.findIsCaseSensitive);
			alterClass(this.caseSensitiveElem, CLASS_ACTIVE, workspaceState.findIsCaseSensitive);
			this.clearMatches();
			this.findMatches(this.getCurrentHash(), true);
		});

		this.regexElem = document.getElementById('findRegex')!;
		alterClass(this.regexElem, CLASS_ACTIVE, workspaceState.findIsRegex);
		this.regexElem.addEventListener('click', () => {
			updateWorkspaceViewState('findIsRegex', !workspaceState.findIsRegex);
			alterClass(this.regexElem, CLASS_ACTIVE, workspaceState.findIsRegex);
			this.clearMatches();
			this.findMatches(this.getCurrentHash(), true);
		});

		const fuzzy = document.getElementById('findFuzzy')!;
		fuzzy.addEventListener('click', () => { this.fuzzy = !this.fuzzy; fuzzy.setAttribute('aria-pressed', String(this.fuzzy)); this.clearMatches(); this.findMatches(null, true); });
		this.positionElem = document.getElementById('findPosition')!;

		this.prevElem = document.getElementById('findPrev')!;
		this.prevElem.classList.add(CLASS_DISABLED);
		this.prevElem.innerHTML = SVG_ICONS.arrowUp;
		this.prevElem.addEventListener('click', () => this.prev());

		this.nextElem = document.getElementById('findNext')!;
		this.nextElem.classList.add(CLASS_DISABLED);
		this.nextElem.innerHTML = SVG_ICONS.arrowDown;
		this.nextElem.addEventListener('click', () => this.next());

		const openCdvElem = document.getElementById('findOpenCdv')!;
		openCdvElem.innerHTML = SVG_ICONS.cdv;
		alterClass(openCdvElem, CLASS_ACTIVE, workspaceState.findOpenCommitDetailsView);
		openCdvElem.addEventListener('click', () => {
			updateWorkspaceViewState('findOpenCommitDetailsView', !workspaceState.findOpenCommitDetailsView);
			alterClass(openCdvElem, CLASS_ACTIVE, workspaceState.findOpenCommitDetailsView);
			this.openCommitDetailsViewForCurrentMatchIfEnabled();
		});

		const findCloseElem = document.getElementById('findClose')!;
		findCloseElem.innerHTML = SVG_ICONS.close;
		findCloseElem.addEventListener('click', () => this.close());
	}

	/**
	 * Show the Find Widget.
	 * @param transition Should the Find Widget animate when becoming visible (sliding down).
	 */
	public show(transition: boolean) {
		if (!this.visible) {
			this.visible = true;
			this.inputElem.value = this.text;
			this.inputElem.disabled = false;
			this.updatePosition(-1, false);
			alterClass(this.widgetElem, CLASS_TRANSITION, transition);
			this.widgetElem.classList.add(CLASS_ACTIVE);
		}
		this.inputElem.focus();
	}

	/**
	 * Close the Find Widget, sliding it up out of view.
	 */
	public close() {
		if (!this.visible) return;
		this.visible = false;
		this.searchGeneration++; this.searchAbort?.abort();
		this.widgetElem.classList.add(CLASS_TRANSITION);
		this.widgetElem.classList.remove(CLASS_ACTIVE);
		this.clearMatches();
		this.text = '';
		this.matches = [];
		this.matchCache = null;
		this.position = -1;
		this.inputElem.value = this.text;
		this.inputElem.disabled = true;
		this.widgetElem.removeAttribute(ATTR_ERROR);
		this.prevElem.classList.add(CLASS_DISABLED);
		this.nextElem.classList.add(CLASS_DISABLED);
		this.view.saveState();
	}

	/**
	 * Refresh the Find Widget's state / matches after the commits have changed.
	 */
	public refresh() {
		if (this.visible) {
			this.findMatches(this.getCurrentHash(), false);
		}
	}

	/**
	 * Set the colours used to indicate the find matches.
	 * @param colour The base colour for the find matches.
	 */
	public setColour(colour: string) {
		document.body.style.setProperty('--git-graph-findMatch', colour);
		document.body.style.setProperty('--git-graph-findMatchCommit', modifyColourOpacity(colour, 0.5));
	}


	/* State */

	/**
	 * Get the current state of the Find Widget.
	 */
	public getState(): FindWidgetState {
		return {
			text: this.text,
			currentHash: this.getCurrentHash(),
			visible: this.visible,
			fuzzy: this.fuzzy
		};
	}

	/**
	 * Get the commit hash of the current find match.
	 * @returns The commit hash, or NULL if no commit is currently matched.
	 */
	public getCurrentHash() {
		return this.position > -1 ? this.matches[this.position].hash : null;
	}

	/**
	 * Restore the Find Widget to an existing state.
	 * @param state The previous Find Widget state.
	 */
	public restoreState(state: FindWidgetState) {
		if (!state.visible) return;
		this.text = state.text;
		this.fuzzy = state.fuzzy ?? true;
		document.getElementById('findFuzzy')!.setAttribute('aria-pressed', String(this.fuzzy));
		this.show(false);
		if (this.text !== '') this.findMatches(state.currentHash, false);
	}

	/**
	 * Is the Find Widget currently visible.
	 * @returns TRUE => The Find Widget is visible, FALSE => The Find Widget is not visible
	 */
	public isVisible() {
		return this.visible;
	}


	/* Matching */

	/**
	 * Find all matches based on the user's criteria.
	 * @param goToCommitHash If this commit hash matches the criteria, directly go to this commit instead of starting at the first match.
	 * @param scrollToCommit Should the resultant find match be scrolled to (so it's visible in the view).
	 */
	private async findMatches(goToCommitHash: string | null, scrollToCommit: boolean) {
		const generation = ++this.searchGeneration;
		let persist = scrollToCommit;
		const mode = workspaceState.findIsRegex ? 'regex' : this.fuzzy ? 'fuzzy' : 'exact';
		const commits = this.view.getSearchCommits(), visibility = this.view.getColumnVisibility();
		const key = JSON.stringify([this.text, mode, workspaceState.findIsCaseSensitive, visibility]);
		try {
			if (!this.visible) return;
			if (!this.matchCache || this.matchCache.commits !== commits || this.matchCache.key !== key) {
				const indexKey = JSON.stringify(visibility);
				if (!this.searchIndex || this.searchIndex.commits !== commits || this.searchIndex.key !== indexKey) this.searchIndex = { commits, key: indexKey, index: new HistorySearch(commits.filter(commit => commit.hash !== UNCOMMITTED), commit => [commit.message, ...commit.heads, ...commit.remotes.map(ref => ref.name), ...commit.tags.map(ref => ref.name), commit.stash?.selector ?? '', visibility.author ? commit.author : '', visibility.commit ? commit.hash : '', visibility.date ? formatShortDate(commit.date).formatted : ''].join(' · ')) };
				this.searchAbort?.abort(); this.searchAbort = new AbortController();
				const search = this.searchIndex.index;
				this.matchCache = { commits, key, promise: this.text ? search.findAsync(this.text, mode, workspaceState.findIsCaseSensitive, Infinity, this.searchAbort.signal).then(hits => hits.map(hit => hit.item.hash)) : Promise.resolve([]) };
			}
			const cache = this.matchCache, hashes = await cache.promise;
			if (generation !== this.searchGeneration || !this.visible) return;
			this.clearMatches(); this.position = -1;
			persist = persist || this.activeCache !== cache;
			if (this.activeCache !== cache) { this.matches = hashes.map(hash => ({ hash, elem: null })); this.byHash = new Map(this.matches.map(match => [match.hash, match])); this.activeCache = cache; }
			this.widgetElem.removeAttribute(ATTR_ERROR);
			const visibleRows = new Map([...getCommitElems()].map(elem => [this.view.getCommits()[Number(elem.dataset.id)].hash, elem]));
			for (const match of this.visibleMatches) match.elem = null;
			this.visibleMatches = [];
			for (const [hash, row] of visibleRows) {
				const match = this.byHash.get(hash); if (!match) continue;
				match.elem = row; this.visibleMatches.push(match);
				for (const textElem of getChildNodesWithTextContent(row)) {
					const text = textElem.textContent!, positions = searchText(text, this.text, mode, workspaceState.findIsCaseSensitive);
					if (!positions.size) continue;
					const fragment = document.createDocumentFragment();
					for (let i = 0; i < text.length;) {
						const matched = positions.has(i), start = i++;
						while (i < text.length && positions.has(i) === matched) i++;
						fragment.append(matched ? FindWidget.createMatchElem(text.slice(start, i)) : document.createTextNode(text.slice(start, i)));
					}
					textElem.parentNode!.replaceChild(fragment, textElem);
				}
			}
		} catch (error) { if (generation !== this.searchGeneration || !this.visible) return; this.matches = []; this.matchCache = null; this.widgetElem.setAttribute(ATTR_ERROR, error instanceof Error ? error.message : String(error)); }

		alterClass(this.prevElem, CLASS_DISABLED, this.matches.length === 0);
		alterClass(this.nextElem, CLASS_DISABLED, this.matches.length === 0);

		let newPos = -1;
		if (this.matches.length > 0) {
			newPos = 0;
			if (goToCommitHash !== null) {
				let pos = this.matches.findIndex(match => match.hash === goToCommitHash);
				if (pos > -1) newPos = pos;
			}
		}
		this.updatePosition(newPos, scrollToCommit, persist);
		if (scrollToCommit) this.openCommitDetailsViewForCurrentMatchIfEnabled();
	}

	/**
	 * Clear all of the highlighted find matches in the view.
	 */
	private clearMatches() {
		for (const row of getCommitElems()) row.classList.remove(CLASS_FIND_CURRENT_COMMIT);
		for (const elem of this.view.getTableElement().querySelectorAll('.' + CLASS_FIND_MATCH)) {
			const parent = elem.parentNode!;
			parent.replaceChild(document.createTextNode(elem.textContent!), elem); parent.normalize();
		}
	}

	/**
	 * Update the user's position in the set of find matches.
	 * @param position The new position index within the find matches.
	 * @param scrollToCommit After updating the user's position in the set of find matches, should the current match be scrolled to (so it's visible in the view).
	 */
	private updatePosition(position: number, scrollToCommit: boolean, persist = true) {
		if (this.position > -1) this.matches[this.position].elem?.classList.remove(CLASS_FIND_CURRENT_COMMIT);
		this.position = position;
		if (this.position > -1) {
			this.matches[this.position].elem?.classList.add(CLASS_FIND_CURRENT_COMMIT);
			if (scrollToCommit) this.view.scrollToCommit(this.matches[position].hash, false);
		}
		this.positionElem.textContent = this.matches.length > 0 ? (this.position + 1) + ' of ' + this.matches.length : 'No Results';
		if (persist) this.view.saveState();
	}

	/**
	 * Move the user's position to the previous match in the set of find matches.
	 */
	private prev() {
		if (this.matches.length === 0) return;
		this.updatePosition(this.position > 0 ? this.position - 1 : this.matches.length - 1, true);
		this.openCommitDetailsViewForCurrentMatchIfEnabled();
	}

	/**
	 * Move the user's position to the next match in the set of find matches.
	 */
	private next() {
		if (this.matches.length === 0) return;
		this.updatePosition(this.position < this.matches.length - 1 ? this.position + 1 : 0, true);
		this.openCommitDetailsViewForCurrentMatchIfEnabled();
	}

	/**
	 * If the Find Widget is configured to open the Commit Details View for the current find match, load the Commit Details View accordingly.
	 */
	private openCommitDetailsViewForCurrentMatchIfEnabled() {
		if (workspaceState.findOpenCommitDetailsView) {
			const commitHash = this.getCurrentHash();
			if (commitHash !== null && !this.view.isCdvOpen(commitHash, null)) {
				const commitElem = this.view.ensureCommitElement(commitHash);
				if (commitElem !== null) {
					this.view.loadCommitDetails(commitElem);
				}
			}
		}
	}

	/**
	 * Create a find match element containing the specified text.
	 * @param text The text content of the find match.
	 * @returns The HTML element for the find match.
	 */
	private static createMatchElem(text: string) {
		const span = document.createElement('span');
		span.className = CLASS_FIND_MATCH;
		span.textContent = text;
		return span;
	}
}
