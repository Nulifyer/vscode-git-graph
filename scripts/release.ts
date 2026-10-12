import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import manifest from '../package.json';
import { releaseMetadata } from './release-metadata';

const root = path.resolve(import.meta.dir, '..');
const metadata = releaseMetadata(manifest, process.env['RELEASE_TAG']);
const mode = process.argv[2] ?? 'metadata';
const preRelease = process.env['PRE_RELEASE'] ?? 'false';
if (!['true', 'false'].includes(preRelease)) throw new Error('PRE_RELEASE must be true or false');

async function run(args: string[]) {
	const child = Bun.spawn(args, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
	if (await child.exited !== 0) throw new Error(`Release command failed: ${args.slice(0, 4).join(' ')}`);
}

if (mode === 'metadata') {
	process.stdout.write(JSON.stringify(metadata) + '\n');
	const outputs = process.env['GITHUB_OUTPUT'];
	if (outputs) await appendFile(outputs, Object.entries(metadata).map(([key, value]) => `${key}=${value}\n`).join(''));
} else if (mode === 'package') {
	await run(['bun', 'run', 'vsce', 'package', '--out', metadata.vsix_name, ...(preRelease === 'true' ? ['--pre-release'] : [])]);
} else if (mode === 'publish') {
	if (!process.env['VSCE_PAT']?.trim()) throw new Error('Set the repository secret VSCE_PAT before publishing to Marketplace');
	const vsix = process.argv[3];
	if (!vsix || path.basename(vsix) !== metadata.vsix_name) throw new Error(`Publish the verified artifact ${metadata.vsix_name}`);
	await readFile(vsix);
	await run(['bun', 'run', 'vsce', 'verify-pat', metadata.publisher]);
	await run(['bun', 'run', 'vsce', 'publish', '--packagePath', path.resolve(vsix), '--skip-duplicate', ...(preRelease === 'true' ? ['--pre-release'] : [])]);
} else {
	throw new Error('Usage: bun scripts/release.ts metadata|package|publish [verified.vsix]');
}
