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
