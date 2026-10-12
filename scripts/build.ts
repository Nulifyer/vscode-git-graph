import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');
const mode = process.argv[2] ?? 'all';
const debug = process.argv.includes('--debug');

async function compile(directory: 'src' | 'web') {
	const result = Bun.spawn(['bun', 'run', 'tsc', '-p', directory], {
		cwd: root,
		stdout: 'inherit',
		stderr: 'inherit'
	});
	if (await result.exited !== 0) throw new Error(`TypeScript compilation failed for ${directory}`);
}

async function buildSource() {
	await compile('src');
	const output = path.join(root, 'out');
	// Preserve the existing Electron filesystem fallback until host tests prove it unnecessary.
	for (const name of await readdir(output)) {
		if (!name.endsWith('.js')) continue;
		const file = path.join(output, name);
		let script = await readFile(file, 'utf8');
		if (!script.includes('require("fs")')) continue;
		script = script.replace('"use strict";', '"use strict";\nfunction requireWithFallback(electronModule, nodeModule) { try { return require(electronModule); } catch {} return require(nodeModule); }');
		await writeFile(file, script.replaceAll('require("fs")', 'requireWithFallback("original-fs", "fs")'));
		const mapFile = file + '.map';
		const map = JSON.parse(await readFile(mapFile, 'utf8')) as { mappings: string };
		map.mappings = ';' + map.mappings;
		await writeFile(mapFile, JSON.stringify(map));
	}
	for (const name of ['askpass.sh', 'askpass-empty.sh']) {
		await copyFile(path.join(root, 'src', 'askpass', name), path.join(output, 'askpass', name));
	}
}

async function buildWeb() {
	await compile('web');
	const names = ['utils', 'contextMenu', 'dialog', 'dropdown', 'findWidget', 'graph', 'settingsWidget', 'textFormatter', 'repositoryWorkbench', 'main'];
	const sources = await Promise.all(names.map(name => readFile(path.join(root, '.build', 'web', 'web', name + '.js'), 'utf8')));
	// The current frontend shares script globals. Keep its initialization order during migration.
	const entrypoint = path.join(root, '.build', 'webview-entry.js');
	const result = await Bun.build({
		entrypoints: [entrypoint],
		files: { [entrypoint]: 'import {historyViewport, foldHistory, pinnedHistoryLanes} from \'./web/src/utils/historyViewport.js\';\nimport {HistorySearch, searchText} from \'./web/src/utils/historySearch.js\';\n' + sources.join('\n') },
		target: 'browser',
		format: 'iife',
		minify: !debug,
		sourcemap: debug ? 'external' : 'none',
		outdir: path.join(root, 'media'),
		naming: 'out.min.js'
	});
	if (!result.success) throw new AggregateError(result.logs, 'Webview bundling failed');
	const styles = ['main', 'contextMenu', 'dialog', 'dropdown', 'findWidget', 'settingsWidget'];
	const css = await Promise.all(styles.map(name => readFile(path.join(root, 'web', 'styles', name + '.css'), 'utf8')));
	await writeFile(path.join(root, 'media', 'out.min.css'), css.join('\n'));
}

if (!['all', 'src', 'web', 'clean'].includes(mode)) throw new Error(`Unknown build mode: ${mode}`);
if (mode === 'all' || mode === 'clean') {
	await Promise.all(['out', 'media', '.build'].map(directory => rm(path.join(root, directory), { recursive: true, force: true })));
}
if (mode !== 'clean') {
	await mkdir(path.join(root, 'media'), { recursive: true });
	if (mode === 'all' || mode === 'src') await buildSource();
	if (mode === 'all' || mode === 'web') await buildWeb();
}
