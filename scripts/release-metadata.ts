interface ReleaseManifest {
	name: string;
	publisher: string;
	version: string;
	packageManager: string;
}

export function releaseMetadata(manifest: ReleaseManifest, tag?: string) {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.name)) throw new Error('Extension name is not safe for an artifact filename');
	if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) throw new Error('VSIX version must be numeric major.minor.patch');
	if (tag && tag !== 'v' + manifest.version) throw new Error(`Release tag ${tag} does not match package.json version ${manifest.version}`);
	if (!/^bun@\d+\.\d+\.\d+$/.test(manifest.packageManager)) throw new Error('Pin Bun in packageManager before releasing');
	return {
		version: manifest.version,
		publisher: manifest.publisher,
		vsix_name: `${manifest.name}-${manifest.version}.vsix`,
		bun_version: manifest.packageManager.slice(4)
	};
}
