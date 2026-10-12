import { Fzf, extendedMatch } from 'fzf';

export type SearchMode = 'fuzzy' | 'exact' | 'regex';
export interface SearchHit<T> { item: T; positions: Set<number> }

/** The same fzf v2 scorer and query syntax serve the graph and repository search. */
export class HistorySearch<T> {
	private readonly records: { item: T; text: string; index: number }[];
	private prepared: { key: string; chunks: Fzf<readonly { item: T; text: string; index: number }[]>[] } | null = null;
	constructor(items: readonly T[], text: (item: T) => string) { this.records = items.map((item, index) => ({ item, text: text(item), index })); }

	private chunks(sensitive: boolean, limit: number) {
		const key = JSON.stringify([sensitive, limit]);
		if (!this.prepared || this.prepared.key !== key) {
			const chunks: Fzf<readonly { item: T; text: string; index: number }[]>[] = [];
			for (let i = 0; i < this.records.length; i += 2048) chunks.push(new Fzf(this.records.slice(i, i + 2048), { selector: record => record.text, match: extendedMatch, casing: sensitive ? 'case-sensitive' : 'smart-case', limit }));
			this.prepared = { key, chunks };
		}
		return this.prepared.chunks;
	}

	public find(query: string, mode: SearchMode = 'fuzzy', caseSensitive = false, limit = Infinity): SearchHit<T>[] {
		if (mode !== 'fuzzy') return this.literal(query, mode, caseSensitive, limit);
		let best: { item: { item: T; index: number }; score: number; positions: Set<number> }[] = [];
		for (const chunk of this.chunks(caseSensitive, limit)) {
			best.push(...chunk.find(query));
			if (Number.isFinite(limit)) { best.sort((a, b) => b.score - a.score || a.item.index - b.item.index); best.length = Math.min(best.length, limit); }
		}
		if (!Number.isFinite(limit)) best.sort((a, b) => b.score - a.score || a.item.index - b.item.index);
		return best.map(hit => ({ item: hit.item.item, positions: this.positions(this.records[hit.item.index].text, hit.positions) }));
	}

	public async findAsync(query: string, mode: SearchMode = 'fuzzy', caseSensitive = false, limit = Infinity, signal?: AbortSignal): Promise<SearchHit<T>[]> {
		if (mode !== 'fuzzy') return this.literal(query, mode, caseSensitive, limit);
		let best: { item: { item: T; index: number }; score: number; positions: Set<number> }[] = [];
		for (const chunk of this.chunks(caseSensitive, limit)) {
			signal?.throwIfAborted();
			best.push(...chunk.find(query));
			if (Number.isFinite(limit)) { best.sort((a, b) => b.score - a.score || a.item.index - b.item.index); best.length = Math.min(best.length, limit); }
			await new Promise<void>(resolve => setTimeout(resolve, 0));
		}
		if (!Number.isFinite(limit)) best.sort((a, b) => b.score - a.score || a.item.index - b.item.index);
		return best.map(hit => ({ item: hit.item.item, positions: this.positions(this.records[hit.item.index].text, hit.positions) }));
	}

	private positions(text: string, positions: Set<number>) {
		if (text === text.normalize()) return positions;
		const result = new Set<number>(); let rune = 0;
		for (const { segment, index } of new Intl.Segmenter().segment(text)) {
			const size = segment.normalize().length;
			if (Array.from({ length: size }, (_, i) => rune + i).some(i => positions.has(i))) for (let i = index; i < index + segment.length; i++) result.add(i);
			rune += size;
		}
		return result;
	}

	private literal(query: string, mode: 'exact' | 'regex', sensitive: boolean, limit: number): SearchHit<T>[] {
		const pattern = new RegExp(mode === 'regex' ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), sensitive ? 'gu' : 'giu');
		const hits: SearchHit<T>[] = [];
		for (const { item, text } of this.records) {
			const positions = new Set<number>();
			pattern.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(text))) {
				if (!match[0].length) throw new Error('Cannot use a regular expression which has zero length matches');
				for (let i = match.index; i < pattern.lastIndex; i++) positions.add(i);
			}
			if (positions.size) hits.push({ item, positions });
			if (hits.length >= limit) break;
		}
		return hits;
	}
}

export function searchText(text: string, query: string, mode: SearchMode, sensitive = false): Set<number> {
	return new HistorySearch([text], value => value).find(query, mode, sensitive)[0]?.positions ?? new Set();
}
