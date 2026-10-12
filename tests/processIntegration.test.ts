import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

import { spawn } from 'child_process';
import { resolveSpawnOutput } from '../src/utils';

describe('Node child process integration', () => {
	it('Collects stdout, stderr, and a failing exit status', async () => {
		const child = spawn(process.execPath, ['-e', 'process.stdout.write("output"); process.stderr.write("failure"); process.exitCode = 7;']);
		const [status, stdout, stderr] = await resolveSpawnOutput(child);
		expect(status).toEqual({ code: 7, error: null });
		expect(stdout.toString()).toBe('output');
		expect(stderr).toBe('failure');
	});

	it('Settles when the caller does not pipe output', async () => {
		const child = spawn(process.execPath, ['-e', 'process.exitCode = 0;'], { stdio: 'ignore' });
		const [status, stdout, stderr] = await resolveSpawnOutput(child);
		expect(status.code).toBe(0);
		expect(stdout.length).toBe(0);
		expect(stderr).toBe('');
	});
});
