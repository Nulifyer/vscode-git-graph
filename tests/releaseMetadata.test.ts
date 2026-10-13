import { releaseMetadata } from '../scripts/release-metadata';

const manifest = { name: 'git-graphity', publisher: 'nulifyer', version: '1.31.4', packageManager: 'bun@1.4.3' };

describe('Release metadata guards', () => {
	it('accepts a matching release tag and derives the VSIX filename', () => {
		expect(releaseMetadata(manifest, 'v1.31.4').vsix_name).toBe('git-graphity-1.31.4.vsix');
	});

	it.each(['v1.31.3', '1.31.4', 'v1.31.4-rc.1', 'v1.31.4\nother=value'])('rejects mismatched or malformed tag %s', tag => {
		expect(() => releaseMetadata(manifest, tag)).toThrow('does not match');
	});

	it.each(['1.31.4-rc.1', '01.31.4', '1.31', '../1.31.4'])('rejects a version that cannot name a VSIX: %s', version => {
		expect(() => releaseMetadata({ ...manifest, version })).toThrow('numeric');
	});

	it.each(['../graph', 'git-graphity\nother=value', 'Git Graphity'])('rejects unsafe artifact names: %s', name => {
		expect(() => releaseMetadata({ ...manifest, name })).toThrow('filename');
	});

	it('rejects an unpinned package manager', () => {
		expect(() => releaseMetadata({ ...manifest, packageManager: 'bun@latest' })).toThrow('Pin Bun');
	});
});
