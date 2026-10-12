import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { RepositoryTools } from '../src/repositoryTools';

const execute = promisify(execFile);
if (!process.argv[2]) throw new Error('Usage: bun scripts/profile-search.ts /path/to/repo [output.json]');
const repo = path.resolve(process.argv[2]);
const tools = new RepositoryTools(async (repo, args) => (await execute('git', args, { cwd: repo, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 128 * 1024 * 1024 })).stdout, '', '');
const samples = [];
for (const query of ['mfplt', 'mfplat !test', '\'mfplat:', '^mfplat:']) {
	const start = performance.now();
	const result = await tools.execute(repo, { kind: 'search', query });
	if (result.kind !== 'history') throw new Error('Unexpected search result');
	samples.push({ query, ms: performance.now() - start, results: result.entries.length, more: result.more, first: result.entries[0]?.subject, positions: result.entries[0]?.positions });
}
const result = { repo, samples, memory: process.memoryUsage() };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
