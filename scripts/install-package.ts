import path from 'node:path';
import manifest from '../package.json';

const root = path.resolve(import.meta.dir, '..');
const file = `${manifest.name}-${manifest.version}.vsix`;
const result = Bun.spawn(['code', '--install-extension', path.join(root, file)], {
	stdout: 'inherit',
	stderr: 'inherit'
});
process.exitCode = await result.exited;
