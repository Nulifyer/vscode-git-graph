/** Map history coordinates to bounded rendered rows, retaining detail anchors. */
export function historyViewport(count: number, scrollTop: number, height: number, rowHeight: number, expansion: { index: number; height: number } | null, pinned: readonly number[] = [], overscan = 12) {
	const coordinate = (pixel: number) => {
		if (expansion && pixel > (expansion.index + 1) * rowHeight) {
			pixel -= Math.min(expansion.height, pixel - (expansion.index + 1) * rowHeight);
		}
		return Math.max(0, Math.floor(pixel / rowHeight));
	};
	const first = Math.min(count, Math.max(0, coordinate(scrollTop) - overscan));
	const last = Math.min(count, coordinate(scrollTop + height) + overscan + 1);
	const rows = new Set<number>();
	for (let i = first; i < last; i++) rows.add(i);
	for (const index of pinned) if (index >= 0 && index < count) rows.add(index);
	return { first, last, rows: [...rows].sort((a, b) => a - b) };
}

import type { GitCommit } from '../types';

/** Fold only unlabelled, non-branching linear runs. Keep the source history intact. */
export function foldHistory(source: readonly GitCommit[], protectedHashes: ReadonlySet<string>, expanded: ReadonlySet<string>) {
	const children = new Map<string, number>();
	for (const commit of source) for (const parent of commit.parents) children.set(parent, (children.get(parent) || 0) + 1);
	const eligible = (commit: GitCommit) => commit.parents.length === 1 && children.get(commit.hash) === 1 && !protectedHashes.has(commit.hash) && !commit.heads.length && !commit.tags.length && !commit.remotes.length && commit.stash === null && commit.hash !== '*';
	const groups = new Map<string, string[]>(), redirects = new Map<string, string>(), shown: GitCommit[] = [];
	for (let i = 0; i < source.length;) {
		let end = i + 1;
		if (eligible(source[i])) while (end < source.length && eligible(source[end]) && source[end - 1].parents[0] === source[end].hash) end++;
		const run = source.slice(i, end);
		if (run.length >= 4 && !run.some(commit => expanded.has(commit.hash))) {
			const anchor = run[0]; groups.set(anchor.hash, run.map(commit => commit.hash));
			for (const commit of run) redirects.set(commit.hash, anchor.hash);
			shown.push({ ...anchor, parents: run.at(-1)!.parents, message: run.length + ' commits · ' + anchor.message });
		} else shown.push(...run);
		i = end;
	}
	return { commits: shown.map(commit => ({ ...commit, parents: commit.parents.map(hash => redirects.get(hash) || hash) })), groups };
}

/** Pin first-parent ancestry in stable columns; other branches use later lanes. */
export function pinnedHistoryLanes(commits: readonly GitCommit[], names: readonly string[]) {
	const lookup = new Map(commits.map((commit, index) => [commit.hash, index]));
	const lanes = new Map<number, number>(); let count = 0;
	for (const name of new Set(names)) {
		let index = commits.findIndex(commit => commit.heads.includes(name) || commit.remotes.some(remote => remote.name === name));
		if (index < 0) continue;
		const visited = new Set<number>(), lane = count++;
		while (index >= 0 && !visited.has(index)) {
			visited.add(index); if (!lanes.has(index)) lanes.set(index, lane);
			index = lookup.get(commits[index].parents[0]) ?? -1;
		}
	}
	return { lanes, count };
}
