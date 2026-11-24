import { historyViewport } from '../src/utils/historyViewport';

describe('History viewport', () => {
	it('bounds DOM rows independently of the loaded history size', () => {
		const viewport = historyViewport(200000, 2400000, 720, 24, null);
		expect(viewport.first).toBe(99988);
		expect(viewport.last).toBe(100043);
		expect(viewport.rows.length).toBe(55);
	});
	it('retains distant comparison anchors without rendering the intervening history', () => {
		const viewport = historyViewport(200000, 2400000, 720, 24, null, [4, 199999]);
		expect(viewport.rows.length).toBe(57);
		expect(viewport.rows[0]).toBe(4);
		expect(viewport.rows.at(-1)).toBe(199999);
	});
	it('accounts for inline details when scrolling beyond or inside them', () => {
		expect(historyViewport(100, 744, 24, 24, { index: 9, height: 480 }, [], 0).first).toBe(11);
		expect(historyViewport(100, 400, 24, 24, { index: 9, height: 480 }, [9], 0).rows).toEqual([9, 10]);
	});
	it('clamps the last viewport and handles empty histories', () => {
		expect(historyViewport(100, 2380, 720, 24, null).rows.at(-1)).toBe(99);
		expect(historyViewport(0, 0, 720, 24, null).rows).toEqual([]);
	});
});

import { foldHistory, pinnedHistoryLanes } from '../src/utils/historyViewport';
import type { GitCommit } from '../src/types';
const chain = (length: number): GitCommit[] => Array.from({ length }, (_, index) => ({ hash: index.toString(16).padStart(40, '0'), parents: index + 1 < length ? [(index + 1).toString(16).padStart(40, '0')] : [], author: 'Fixture', email: 'fixture@example.test', date: 0, message: 'Commit ' + index, heads: index === 0 ? ['main'] : [], tags: [], remotes: [], stash: null }));

it('folds linear runs and redirects edges without changing source parents', () => {
	const commits = chain(10), folded = foldHistory(commits, new Set(), new Set());
	expect(folded.commits.length).toBe(3);
	expect(folded.groups.get(commits[1].hash)?.length).toBe(8);
	expect(folded.commits[1].parents).toEqual([commits[9].hash]);
	expect(commits[1].parents).toEqual([commits[2].hash]);
	expect(foldHistory(commits, new Set(), new Set([commits[1].hash])).commits.length).toBe(10);
});
it('preserves merge vertices, labelled commits and active selection', () => {
	const commits = chain(12);
	commits[6] = { ...commits[6], parents: [commits[7].hash, commits[10].hash] };
	commits[8] = { ...commits[8], tags: [{ name: 'v1', annotated: false }] };
	const folded = foldHistory(commits, new Set([commits[3].hash]), new Set());
	for (const index of [3, 6, 8, 10]) expect(folded.commits.some(commit => commit.hash === commits[index].hash)).toBe(true);
});
it('pins named branch ancestry while ignoring missing branch names', () => {
	const commits = chain(10), pinned = pinnedHistoryLanes(commits, ['missing', 'main', 'main']);
	expect(pinned.count).toBe(1);
	expect([...pinned.lanes.values()]).toEqual(Array(10).fill(0));
});

import { tagMarkerCommits } from '../src/utils/historyViewport';
describe('Tag marker commits', () => {
	const hash = (name: string) => name.padEnd(40, '0');
	const commit = (name: string, parents: string[], refs: { heads?: string[]; tags?: string[]; remotes?: string[] } = {}): GitCommit => ({ hash: hash(name), parents: parents.map(hash), author: 'Fixture', email: 'fixture@example.test', date: 0, message: name, heads: refs.heads || [], tags: (refs.tags || []).map((tag) => ({ name: tag, annotated: false })), remotes: (refs.remotes || []).map((remote) => ({ name: remote, remote: 'origin' })), stash: null });
	const indexes = (commits: GitCommit[], head: string | null = null) => [...tagMarkerCommits(commits, head)].sort((a, b) => a - b);

	it('marks pull request build merges whose parents stay on branches', () => {
		// b1 and b2 are build tags on merge previews of develop (d*) into main (m*)
		const commits = [
			commit('d2', ['d1'], { heads: ['develop'] }),
			commit('b2', ['m1', 'd1'], { tags: ['481050'] }),
			commit('m2', ['m1'], { heads: ['main'] }),
			commit('b1', ['m1', 'd0'], { tags: ['440601'] }),
			commit('d1', ['d0']),
			commit('m1', ['d0']),
			commit('d0', [])
		];
		expect(indexes(commits)).toEqual([1, 3]);
	});

	it('keeps a lane when the tag is the only thing holding history', () => {
		// A deleted release branch: r2 is tagged, r1 has no other child
		const commits = [
			commit('m1', ['m0'], { heads: ['main'] }),
			commit('r2', ['r1'], { tags: ['v1.0'] }),
			commit('r1', ['m0']),
			commit('m0', [])
		];
		expect(indexes(commits)).toEqual([]);
	});

	it('keeps a lane when two builds are the only children of a commit', () => {
		const commits = [
			commit('m1', ['m0'], { heads: ['main'] }),
			commit('b2', ['m0', 'f1'], { tags: ['2'] }),
			commit('b1', ['m0', 'f1'], { tags: ['1'] }),
			commit('f1', ['m0']),
			commit('m0', [])
		];
		expect(indexes(commits)).toEqual([]);
	});

	it('ignores commits with other references, children, or HEAD', () => {
		const commits = [
			commit('a', ['m0'], { tags: ['t1'], heads: ['feature'] }),
			commit('b', ['m0'], { tags: ['t2'], remotes: ['origin/b'] }),
			commit('c', ['m0'], { tags: ['t3'] }),
			commit('d', ['m0'], { tags: ['t4'] }),
			commit('m0', [], { heads: ['main'] })
		];
		expect(indexes(commits, hash('c'))).toEqual([3]);
	});

	it('treats parents that are not loaded as anchored', () => {
		expect(indexes([commit('main', ['x'], { heads: ['main'] }), commit('build', ['y'], { tags: ['9'] })])).toEqual([1]);
	});
});
