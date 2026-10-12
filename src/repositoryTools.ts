import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { HistorySearch } from './utils/historySearch';

import type { HistoryEntry, OperationState, RebasePlan, RepositoryToolAction, RepositoryToolResult, Worktree } from './utils/repositoryToolTypes';
export type GitRunner = (repo: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<string>;

/** Git workflows share validation, operation state and persistent rebase plans. */
export class RepositoryTools {
	private readonly searches = new Map<string, AbortController>();
	private readonly changing = new Set<string>();
	private readonly searchCache = new Map<string, Promise<{ entries: HistoryEntry[]; index: HistorySearch<HistoryEntry> }>>();
	constructor(private readonly run: GitRunner, private readonly storage: string, private readonly editor: string) {}

	public async execute(repo: string, tool: RepositoryToolAction): Promise<RepositoryToolResult> {
		if (!tool || typeof tool.kind !== 'string') throw new Error('Invalid repository workflow');
		const changes = ['addWorktree', 'removeWorktree', 'rebasePlan', 'runRebase', 'continue', 'abort', 'stageConflict'].includes(tool.kind);
		if (changes && this.changing.has(repo)) throw new Error('Another repository workflow is still running');
		if (changes) this.changing.add(repo);
		try { return await this.perform(repo, tool); } finally { if (changes) this.changing.delete(repo); }
	}

	private async perform(repo: string, tool: RepositoryToolAction): Promise<RepositoryToolResult> {
		switch (tool.kind) {
			case 'search': {
				this.searches.get(repo)?.abort(); const controller = new AbortController(); this.searches.set(repo, controller);
				try { return await this.search(repo, tool, controller.signal); } finally { if (this.searches.get(repo) === controller) this.searches.delete(repo); }
			}
			case 'worktrees': return { kind: 'worktrees', worktrees: await this.worktrees(repo) };
			case 'addWorktree':
				await this.resolve(repo, tool.reference);
				await this.run(repo, ['worktree', 'add', '--', path.resolve(repo, this.text(tool.path)), this.text(tool.reference)]);
				return { kind: 'worktrees', worktrees: await this.worktrees(repo) };
			case 'removeWorktree': {
				const tree = await this.findWorktree(repo, tool.path);
				if (tree.main) throw new Error('The main worktree cannot be removed here');
				await this.run(repo, ['worktree', 'remove', '--', tree.path]);
				return { kind: 'worktrees', worktrees: await this.worktrees(repo) };
			}
			case 'openWorktree': return { kind: 'open', path: (await this.findWorktree(repo, tool.path)).path, merge: false };
			case 'rebasePlan': return this.rebasePlan(repo, tool.base);
			case 'runRebase': return this.runRebase(repo, tool);
			case 'operation': return { kind: 'operation', state: await this.operation(repo) };
			case 'continue': case 'abort': {
				const state = await this.operation(repo);
				if (state.operation === null) throw new Error('There is no Git operation to ' + tool.kind);
				if (tool.kind === 'continue' && state.conflicts.length) throw new Error('Resolve and stage the conflicting files before continuing');
				try { await this.run(repo, [state.operation, '--' + tool.kind], this.editorEnvironment(repo)); } catch (error) {
					const current = await this.operation(repo);
					if (current.operation === null) throw error;
					return { kind: 'operation', state: { ...current, warning: String(error) } };
				}
				const current = await this.operation(repo);
				if (current.operation === null) await rm(this.planPath(repo), { force: true });
				return { kind: 'operation', state: current };
			}
			case 'stageConflict': case 'openConflict': {
				const state = await this.operation(repo);
				if (!state.conflicts.includes(tool.file)) throw new Error('This file is not a current conflict');
				if (tool.kind === 'openConflict') return { kind: 'open', path: path.resolve(repo, tool.file), merge: true };
				await this.run(repo, ['add', '--', tool.file]);
				return { kind: 'operation', state: await this.operation(repo) };
			}
			default: throw new Error('Unknown repository workflow');
		}
	}

	private text(value: string): string {
		if (typeof value !== 'string' || !value.trim() || value.includes('\0') || value.length > 4096) throw new Error('Invalid workflow input');
		return value;
	}

	private async resolve(repo: string, reference: string) {
		return (await this.run(repo, ['rev-parse', '--verify', '--end-of-options', this.text(reference) + '^{commit}'])).trim();
	}

	private history(output: string): HistoryEntry[] {
		const fields = output.split('\0'), entries: HistoryEntry[] = [];
		for (let i = 0; i + 3 < fields.length; i += 4) {
			const hash = fields[i].trim();
			if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error('Git returned invalid history');
			entries.push({ hash, author: fields[i + 1], date: Number(fields[i + 2]), subject: fields[i + 3] });
		}
		return entries;
	}

	private async search(repo: string, tool: Extract<RepositoryToolAction, { kind: 'search' }>, signal: AbortSignal): Promise<RepositoryToolResult> {
		const offset = tool.offset ?? 0, mode = tool.mode ?? 'fuzzy';
		if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new Error('Invalid search page');
		if (!['fuzzy', 'exact', 'regex'].includes(mode) || typeof tool.query !== 'string' || tool.query.length > 4096) throw new Error('Invalid search query');
		if (tool.follow && !tool.file) throw new Error('Choose a file to follow its history');
		const args = ['log', '--date-order', '--format=%H%x00%an%x00%at%x00%s%x00', '--fixed-strings', '--regexp-ignore-case'];
		let queryHash: string | null = null;
		if (/^[a-f0-9]{7,64}$/i.test(tool.query)) { try { queryHash = await this.resolve(repo, tool.query); } catch {} }
		if (tool.author) args.push('--author=' + this.text(tool.author));
		if (tool.since) args.push('--since=' + this.text(tool.since) + (/^\d{4}-\d{2}-\d{2}$/.test(tool.since) ? 'T00:00:00' : ''));
		if (tool.until) args.push('--until=' + this.text(tool.until) + (/^\d{4}-\d{2}-\d{2}$/.test(tool.until) ? 'T23:59:59' : ''));
		if (tool.follow) args.push('--follow');
		if (queryHash) args.push('--no-walk', queryHash);
		else if (tool.reference || tool.follow) args.push(await this.resolve(repo, tool.reference || 'HEAD')); else args.push('--all');
		args.push('--');
		if (tool.file) args.push(':(literal)' + this.text(tool.file));
		// Invalidate on any ref/HEAD change, including commits on another branch.
		const refs = await this.run(repo, ['for-each-ref', '--format=%(refname) %(objectname)']);
		const head = await this.resolve(repo, 'HEAD');
		const key = JSON.stringify([repo, args, createHash('sha256').update(refs + head).digest('hex')]);
		let snapshot = this.searchCache.get(key);
		if (!snapshot) {
			while (this.searchCache.size >= 2) this.searchCache.delete(this.searchCache.keys().next().value!);
			snapshot = this.run(repo, args).then(output => { const entries = this.history(output); return { entries, index: new HistorySearch(entries, entry => entry.subject) }; });
			this.searchCache.set(key, snapshot);
			snapshot.catch(() => this.searchCache.delete(key));
		}
		const { entries, index } = await snapshot; signal.throwIfAborted();
		if (!tool.query || queryHash) return { kind: 'history', entries: entries.slice(offset, offset + 100), more: entries.length > offset + 100 };
		const hits = await index.findAsync(tool.query, mode, false, offset + 101, signal);
		return { kind: 'history', entries: hits.slice(offset, offset + 100).map(hit => ({ ...hit.item, positions: [...hit.positions] })), more: hits.length > offset + 100 };
	}

	private async worktrees(repo: string): Promise<Worktree[]> {
		const output = await this.run(repo, ['worktree', 'list', '--porcelain', '-z']);
		return output.split('\0\0').filter(Boolean).map((record, index) => {
			const fields = record.split('\0');
			return { path: fields[0].slice(9), head: fields.find(s => s.startsWith('HEAD '))?.slice(5) || '', branch: fields.find(s => s.startsWith('branch '))?.slice(7).replace(/^refs\/heads\//, '') || null, locked: fields.some(s => s.startsWith('locked')), prunable: fields.some(s => s.startsWith('prunable')), main: index === 0 };
		});
	}

	private async findWorktree(repo: string, location: string) {
		const resolved = path.resolve(repo, this.text(location));
		const tree = (await this.worktrees(repo)).find(tree => path.resolve(tree.path) === resolved);
		if (!tree) throw new Error('This path is not a worktree of the current repository');
		return tree;
	}

	private planPath(repo: string) { return path.join(this.storage, createHash('sha256').update(path.resolve(repo)).digest('hex') + '.json'); }

	private async rebasePlan(repo: string, reference: string): Promise<RepositoryToolResult> {
		if ((await this.operation(repo)).operation) throw new Error('Finish or abort the current Git operation first');
		const base = await this.resolve(repo, reference), head = await this.resolve(repo, 'HEAD');
		const branch = (await this.run(repo, ['symbolic-ref', '--short', 'HEAD'])).trim();
		if ((await this.run(repo, ['rev-list', '--merges', base + '..' + head])).trim()) throw new Error('This range contains merges. Choose a linear range or use the existing terminal rebase to control merge handling.');
		const entries = this.history(await this.run(repo, ['log', '--reverse', '--topo-order', '--max-count=501', '--format=%H%x00%an%x00%at%x00%B%x00', base + '..' + head, '--']));
		if (!entries.length || entries.length > 500) throw new Error('Choose a rebase range containing 1 to 500 commits');
		const plan: RebasePlan = { id: randomUUID(), head, base, branch, entries: entries.map(e => ({ hash: e.hash, subject: e.subject.split(/\r?\n/)[0], message: e.subject.trimEnd(), action: 'pick' })) };
		await mkdir(this.storage, { recursive: true, mode: 0o700 });
		await writeFile(this.planPath(repo), JSON.stringify(plan), { mode: 0o600 });
		return { kind: 'plan', plan };
	}

	private editorEnvironment(repo: string): NodeJS.ProcessEnv {
		const quote = (s: string) => '\'' + s.replaceAll('\'', '\'\\\'\'') + '\'';
		const editor = quote(process.execPath.replaceAll('\\', '/')) + ' ' + quote(this.editor.replaceAll('\\', '/'));
		return { GIT_SEQUENCE_EDITOR: editor + ' sequence', GIT_EDITOR: editor + ' message', GGM_REBASE_PLAN: this.planPath(repo), ELECTRON_RUN_AS_NODE: '1' };
	}

	private async runRebase(repo: string, tool: Extract<RepositoryToolAction, { kind: 'runRebase' }>): Promise<RepositoryToolResult> {
		const plan: RebasePlan = JSON.parse(await readFile(this.planPath(repo), 'utf8'));
		if (tool.id !== plan.id || await this.resolve(repo, 'HEAD') !== plan.head || (await this.run(repo, ['symbolic-ref', '--short', 'HEAD'])).trim() !== plan.branch) throw new Error('The branch changed. Prepare a fresh rebase plan.');
		if ((await this.run(repo, ['status', '--porcelain', '--untracked-files=no'])).trim()) throw new Error('Commit or stash tracked changes before rebasing');
		const hashes = new Set(plan.entries.map(e => e.hash));
		if (!Array.isArray(tool.entries) || tool.entries.length !== hashes.size) throw new Error('The plan must contain every original commit exactly once');
		let first = true;
		for (const entry of tool.entries) {
			if (!hashes.delete(entry.hash) || !['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'].includes(entry.action)) throw new Error('Invalid rebase plan');
			if (first && ['squash', 'fixup'].includes(entry.action)) throw new Error('The first retained commit cannot be squash or fixup');
			if (entry.action !== 'drop') first = false;
			if (entry.action === 'reword' && !entry.message?.trim()) throw new Error('Enter the new message for each reword action');
		}
		await writeFile(this.planPath(repo), JSON.stringify({ ...plan, entries: tool.entries }), { mode: 0o600 });
		let warning: string | undefined;
		try { await this.run(repo, ['rebase', '--interactive', '--no-fork-point', plan.base], this.editorEnvironment(repo)); } catch (error) {
			if ((await this.operation(repo)).operation === null) throw error;
			warning = String(error);
		}
		const state = await this.operation(repo);
		if (state.operation === null) await rm(this.planPath(repo), { force: true });
		return { kind: 'operation', state: { ...state, warning } };
	}

	private async operation(repo: string): Promise<OperationState> {
		const gitDir = path.resolve(repo, (await this.run(repo, ['rev-parse', '--git-dir'])).trim());
		const exists = async (name: string) => { try { await stat(path.join(gitDir, name)); return true; } catch { return false; } };
		let operation: OperationState['operation'] = null;
		if (await exists('rebase-merge') || await exists('rebase-apply')) operation = 'rebase';
		else if (await exists('MERGE_HEAD')) operation = 'merge';
		else if (await exists('CHERRY_PICK_HEAD')) operation = 'cherry-pick';
		else if (await exists('REVERT_HEAD')) operation = 'revert';
		const conflicts = (await this.run(repo, ['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean);
		return { operation, conflicts };
	}
}
