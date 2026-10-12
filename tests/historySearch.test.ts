import { HistorySearch, searchText } from '../src/utils/historySearch';
import { Fzf, extendedMatch } from 'fzf';

const subjects = ['Fix graph renderer', 'Very long unrelated gap before g and r and p', 'Graph reader', 'Update packages'];
const search = new HistorySearch(subjects, text => text);

it('ranks contiguous and word-boundary matches ahead of scattered letters', () => {
	const results = new HistorySearch(['g.......r', 'graph', 'before graph'], text => text).find('gr').map(hit => hit.item);
	expect(results[0]).toBe('graph');
	expect(results.at(-1)).toBe('g.......r');
	expect(search.find('fxgr').map(hit => hit.item)).toContain('Fix graph renderer');
});

it('supports fzf terms, exact, prefix, suffix, exclusion and alternatives', () => {
	expect(search.find('gr !reader').map(hit => hit.item)).toContain('Fix graph renderer');
	expect(search.find('\'graph renderer').map(hit => hit.item)).toEqual(['Fix graph renderer']);
	expect(search.find('^Graph reader$').map(hit => hit.item)).toEqual(['Graph reader']);
	expect(search.find('^Update | ^Graph').map(hit => hit.item).sort()).toEqual(['Graph reader', 'Update packages']);
});

it('uses smart case for fuzzy search and preserves exact and regex modes', () => {
	expect(search.find('graph').length).toBe(2);
	expect(search.find('Graph').map(hit => hit.item)).toEqual(['Graph reader']);
	expect(search.find('grpr', 'exact')).toHaveLength(0);
	expect(search.find('graph', 'exact')).toHaveLength(2);
	expect(search.find('^Fix.*renderer$', 'regex').map(hit => hit.item)).toEqual(['Fix graph renderer']);
	expect(() => search.find('[', 'regex')).toThrow();
	expect(() => search.find('.*?', 'regex')).toThrow('zero length');
});

it('returns character positions for highlighting without HTML interpretation', () => {
	const positions = searchText('Fix graph renderer', 'fxgr', 'fuzzy');
	expect([...positions].sort((a, b) => a - b)).toEqual([0, 2, 4, 5]);
	expect(searchText('<script>graph</script>', 'graph', 'exact')).toEqual(new Set([8, 9, 10, 11, 12]));
});

it('ranks the entire history before limiting results and agrees in async mode', async () => {
	const records = [...Array.from({ length: 10000 }, (_, i) => 'Filler ' + i), 'Old graph rendering fix'];
	const index = new HistorySearch(records, text => text);
	expect((await index.findAsync('grfx', 'fuzzy', false, 1)).map(hit => hit.item)).toEqual(['Old graph rendering fix']);
	expect(await search.findAsync('gr')).toEqual(search.find('gr'));
});

it('preserves upstream fzf ranking across scoring batches and page boundaries', async () => {
	const records = Array.from({ length: 9000 }, (_, i) => ['Graph renderer', 'Good result', 'g....r', 'gr', 'Update graph'][i % 5] + ' ' + i);
	const expected = new Fzf(records, { match: extendedMatch, limit: 201 }).find('gr');
	const actual = await new HistorySearch(records, text => text).findAsync('gr', 'fuzzy', false, 201);
	expect(actual).toEqual(expected.map(hit => ({ item: hit.item, positions: hit.positions })));
});

it('maps fzf Unicode positions to the original text for highlighting', () => {
	expect(searchText('🔧 Fix graph', 'gr', 'fuzzy')).toEqual(new Set([7, 8]));
	expect(searchText('Cafe\u0301 graph', 'cafe', 'fuzzy')).toEqual(new Set([0, 1, 2, 3, 4]));
});

it('cancels asynchronous scoring when a query is superseded', async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(search.findAsync('gr', 'fuzzy', false, 100, controller.signal)).rejects.toThrow();
});
