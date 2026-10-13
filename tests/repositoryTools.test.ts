import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { RepositoryTools } from '../src/repositoryTools';
import type { RebasePlan } from '../src/utils/repositoryToolTypes';

const execute = promisify(execFile);
let directory: string, repo: string, tools: RepositoryTools;
const git = async (args: string[], cwd = repo, env: NodeJS.ProcessEnv = {}) => (await execute('git', args, { cwd, env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 })).stdout;
const commit = async (file: string, content: string, message: string) => {
	await writeFile(path.join(repo, file), content);
	await git(['add', '--', file]);
	await git(['commit', '-m', message]);
};
const prepare = async (base: string): Promise<RebasePlan> => {
	const result = await tools.execute(repo, { kind: 'rebasePlan', base });
	if (result.kind !== 'plan') throw new Error('Expected a plan');
	return result.plan;
};

beforeEach(async () => {
	directory = await mkdtemp(path.join(os.tmpdir(), 'git-graphity-workflows-'));
	repo = path.join(directory, 'repo'); await mkdir(repo);
	await git(['init', '-b', 'main']);
	await git(['config', 'user.name', 'Fixture']); await git(['config', 'user.email', 'fixture@example.test']);
	await git(['config', 'commit.gpgSign', 'false']); await git(['config', 'core.autocrlf', 'false']);
	tools = new RepositoryTools((repo, args, env) => git(args, repo, env), path.join(directory, 'plans'), path.resolve('resources/rebase-editor.cjs'));
	await commit('original.txt', 'initial\n', 'Initial fixture');
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

it('searches commits outside the displayed page and follows renamed files', async () => {
	await git(['mv', 'original.txt', 'renamed.txt']); await git(['commit', '-m', 'Rename file']);
	await commit('other.txt', 'other\n', 'Unrelated change');
	const search = await tools.execute(repo, { kind: 'search', query: 'Initial' });
	expect(search.kind).toBe('history');
	if (search.kind !== 'history') throw new Error('Expected history');
	expect(search.entries.map(e => e.subject)).toEqual(['Initial fixture']);
	const history = await tools.execute(repo, { kind: 'search', query: '', file: 'renamed.txt', follow: true });
	if (history.kind !== 'history') throw new Error('Expected file history');
	expect(history.entries.map(e => e.subject)).toEqual(['Rename file', 'Initial fixture']);
});

it('treats pathspec metacharacters literally', async () => {
	await commit('literal[1].txt', 'file\n', 'Literal path');
	const result = await tools.execute(repo, { kind: 'search', query: '', file: 'literal[1].txt' });
	if (result.kind !== 'history') throw new Error('Expected history');
	expect(result.entries.map(e => e.subject)).toEqual(['Literal path']);
});

it('fuzzy searches the whole history and invalidates its snapshot when refs change', async () => {
	await commit('one.txt', 'one\n', 'Fix graph rendering');
	await commit('two.txt', 'two\n', 'Unrelated latest commit');
	const result = await tools.execute(repo, { kind: 'search', query: 'fxgr' });
	if (result.kind !== 'history') throw new Error('Expected history');
	expect(result.entries[0].subject).toBe('Fix graph rendering');
	expect(result.entries[0].positions?.length).toBeGreaterThan(0);
	const exact = await tools.execute(repo, { kind: 'search', query: 'fxgr', mode: 'exact' });
	if (exact.kind !== 'history') throw new Error('Expected history');
	expect(exact.entries).toHaveLength(0);
	await commit('three.txt', 'three\n', 'Fix graph renderer again');
	const refreshed = await tools.execute(repo, { kind: 'search', query: 'fxgr' });
	if (refreshed.kind !== 'history') throw new Error('Expected history');
	expect(refreshed.entries.map(entry => entry.subject)).toContain('Fix graph renderer again');
});

it('filters by author, date, regex and exact hashes without interpolating Git options', async () => {
	const head = (await git(['rev-parse', 'HEAD'])).trim();
	for (const query of [head, head.slice(0, 8)]) {
		const result = await tools.execute(repo, { kind: 'search', query });
		if (result.kind !== 'history') throw new Error('Expected history');
		expect(result.entries[0].hash).toBe(head);
	}
	const result = await tools.execute(repo, { kind: 'search', query: '^Initial.*fixture', mode: 'regex', author: 'Fixture', since: '2000-01-01', until: '2099-01-01' });
	if (result.kind !== 'history') throw new Error('Expected history');
	expect(result.entries).toHaveLength(1);
	await expect(tools.execute(repo, { kind: 'search', query: '[', mode: 'regex' })).rejects.toThrow();
	await expect(tools.execute(repo, { kind: 'search', query: '', offset: -1 })).rejects.toThrow('search page');
});

it('reorders and squashes commits and resumes an edit pause', async () => {
	await commit('one.txt', 'one\n', 'One'); await commit('two.txt', 'two\n', 'Two'); await commit('three.txt', 'three\n', 'Three');
	const plan = await prepare('HEAD~3');
	plan.entries = [plan.entries[1], plan.entries[0], plan.entries[2]];
	plan.entries[1].action = 'squash'; plan.entries[1].message = 'Combined two and one'; plan.entries[2].action = 'edit';
	const pause = await tools.execute(repo, { kind: 'runRebase', id: plan.id, entries: plan.entries });
	if (pause.kind !== 'operation') throw new Error('Expected state');
	expect(pause.state.operation).toBe('rebase'); expect(pause.state.conflicts).toEqual([]);
	const done = await tools.execute(repo, { kind: 'continue' });
	if (done.kind !== 'operation') throw new Error('Expected state');
	expect(done.state.operation).toBeNull();
	expect((await git(['log', '--reverse', '--format=%s'])).trim().split('\n')).toEqual(['Initial fixture', 'Combined two and one', 'Three']);
});

it('creates a branch worktree and refuses to remove dirty or main worktrees', async () => {
	await git(['branch', 'feature']); const target = path.join(directory, 'feature');
	const result = await tools.execute(repo, { kind: 'addWorktree', path: target, reference: 'feature' });
	if (result.kind !== 'worktrees') throw new Error('Expected worktrees');
	expect(result.worktrees.find(t => t.path === target)?.branch).toBe('feature');
	await writeFile(path.join(target, 'untracked.txt'), 'Keep this work\n');
	await expect(tools.execute(repo, { kind: 'removeWorktree', path: target })).rejects.toThrow();
	await expect(tools.execute(repo, { kind: 'removeWorktree', path: repo })).rejects.toThrow('main worktree');
	await rm(path.join(target, 'untracked.txt'));
	await tools.execute(repo, { kind: 'removeWorktree', path: target });
	expect(await git(['worktree', 'list', '--porcelain'])).not.toContain(target);
});

it('rewords and fixups a real rebase and removes its finished plan', async () => {
	await commit('one.txt', 'one\n', 'One'); await commit('two.txt', 'two\n', 'Two');
	const plan = await prepare('HEAD~2');
	plan.entries[0].action = 'reword'; plan.entries[0].message = 'Renamed one'; plan.entries[1].action = 'fixup';
	const result = await tools.execute(repo, { kind: 'runRebase', id: plan.id, entries: plan.entries });
	if (result.kind !== 'operation') throw new Error('Expected operation state');
	expect(result.state.operation).toBeNull();
	expect((await git(['log', '-1', '--format=%s'])).trim()).toBe('Renamed one');
	expect(Number(await git(['rev-list', '--count', 'HEAD']))).toBe(2);
});

it('keeps complete commit messages when preparing a reword action', async () => {
	await commit('one.txt', 'one\n', 'Subject\n\nKeep this body\n\nSigned-off-by: Fixture <fixture@example.test>');
	const original = await git(['log', '-1', '--format=%B']);
	const plan = await prepare('HEAD~1');
	expect(plan.entries[0].subject).toBe('Subject');
	expect(plan.entries[0].message).toBe(original.trimEnd());
	plan.entries[0].action = 'reword';
	await tools.execute(repo, { kind: 'runRebase', id: plan.id, entries: plan.entries });
	expect(await git(['log', '-1', '--format=%B'])).toBe(original);
});

it('rejects stale or duplicate plans before changing HEAD', async () => {
	await commit('one.txt', 'one\n', 'One'); await commit('two.txt', 'two\n', 'Two');
	const plan = await prepare('HEAD~2'), head = (await git(['rev-parse', 'HEAD'])).trim();
	await expect(tools.execute(repo, { kind: 'runRebase', id: plan.id, entries: [plan.entries[0], plan.entries[0]] })).rejects.toThrow('Invalid rebase');
	expect((await git(['rev-parse', 'HEAD'])).trim()).toBe(head);
	await commit('three.txt', 'three\n', 'Three');
	await expect(tools.execute(repo, { kind: 'runRebase', id: plan.id, entries: plan.entries })).rejects.toThrow('branch changed');
});

it('surfaces real merge conflicts, stages a resolved file, and continues', async () => {
	await git(['checkout', '-b', 'feature']); await commit('original.txt', 'feature\n', 'Feature');
	await git(['checkout', 'main']); await commit('original.txt', 'main\n', 'Main');
	await expect(git(['merge', 'feature'])).rejects.toThrow();
	const state = await tools.execute(repo, { kind: 'operation' });
	if (state.kind !== 'operation') throw new Error('Expected state');
	expect(state.state).toEqual({ operation: 'merge', conflicts: ['original.txt'] });
	await expect(tools.execute(repo, { kind: 'continue' })).rejects.toThrow('Resolve and stage');
	await writeFile(path.join(repo, 'original.txt'), 'resolved\n');
	await tools.execute(repo, { kind: 'stageConflict', file: 'original.txt' });
	const complete = await tools.execute(repo, { kind: 'continue' });
	if (complete.kind !== 'operation') throw new Error('Expected state');
	expect(complete.state.operation).toBeNull();
});

it('aborts a conflicted rebase and restores its original HEAD', async () => {
	await git(['checkout', '-b', 'feature']); await commit('original.txt', 'feature\n', 'Feature');
	await git(['checkout', 'main']); await commit('original.txt', 'main\n', 'Main');
	await git(['checkout', 'feature']); const head = (await git(['rev-parse', 'HEAD'])).trim();
	const plan = await prepare('main');
	const result = await tools.execute(repo, { kind: 'runRebase', id: plan.id, entries: plan.entries });
	if (result.kind !== 'operation') throw new Error('Expected state');
	expect(result.state.operation).toBe('rebase');
	expect(result.state.conflicts).toEqual(['original.txt']);
	await tools.execute(repo, { kind: 'abort' });
	expect((await git(['rev-parse', 'HEAD'])).trim()).toBe(head);
});
