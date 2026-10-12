import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';
import manifest from '../package.json';

const root = path.resolve(import.meta.dir, '..');
const extensionRoot = path.resolve(process.env['EXTENSION_UNDER_TEST'] ?? root);
const directory = await mkdtemp(path.join(os.tmpdir(), 'git-graph-host-'));
const repository = path.join(directory, 'repository');
const profile = path.join(directory, 'profile');
const themeNames = ['Dark Modern', 'Light Modern', 'Default High Contrast', 'Default High Contrast Light'];
const customPalette: string[] | undefined = process.env['VSCODE_TEST_GRAPH_COLOURS']
	? JSON.parse(process.env['VSCODE_TEST_GRAPH_COLOURS']) : undefined;

// Runs only in the test webview. Observe the DOM and use the same click handler
// as the user; do not treat a history request as evidence of rendered content.
const webviewProbe = `
(() => {
  const acquire = window.acquireVsCodeApi;
  let api;
  window.acquireVsCodeApi = () => (api = acquire());
  let stage = 'history';
  let rows = 0;
  let firstGraphPath;
  const color = value => {
    const element = document.createElement('span');
    element.style.color = value;
    document.body.append(element);
    const result = getComputedStyle(element).color;
    element.remove();
    return result;
  };
  const contrast = (foreground, background) => {
    const luminance = value => {
      const channels = value.match(/[\\d.]+/g).slice(0,3).map(Number).map(channel => {
        channel /= 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  };
  window.addEventListener('message', event => {
    if (!api || event.data.command !== '__hostThemeSample') return;
    const graphPath = document.querySelector('#commitGraph path.line');
    const dropdown = document.querySelector('#branchDropdown .dropdownCurrentValue');
    const icon = document.querySelector('#findBtn svg');
    const reference = document.querySelector('.gitRef.active');
    if (!graphPath || !dropdown || !icon || !reference) return;
    api.postMessage({
      command: '__hostThemeResult',
      theme: document.body.dataset.vscodeThemeId,
      kind: document.body.dataset.vscodeThemeKind,
      stroke: getComputedStyle(graphPath).stroke,
      expectedStroke: color(event.data.customColor || 'var(--vscode-scmGraph-historyItemRefColor, var(--vscode-charts-green))'),
      secondaryStroke: [...document.querySelectorAll('#commitGraph path.line')].map(path => getComputedStyle(path).stroke),
      expectedSecondaryStroke: color(event.data.secondaryColor || 'var(--vscode-scmGraph-foreground1, var(--vscode-charts-yellow))'),
      icon: getComputedStyle(icon).fill,
      expectedIcon: color('var(--vscode-icon-foreground, var(--vscode-foreground))'),
      dropdown: getComputedStyle(dropdown).backgroundColor,
      expectedDropdown: color('var(--vscode-dropdown-background)'),
      background: getComputedStyle(document.querySelector('#view')).backgroundColor,
      expectedBackground: color('var(--vscode-editor-background)'),
      referenceBackground: getComputedStyle(reference).backgroundColor,
      referenceForeground: getComputedStyle(reference).color,
      expectedReferenceBackground: color(event.data.customColor ? 'var(--vscode-badge-background)' : 'var(--vscode-scmGraph-historyItemRefColor, var(--vscode-charts-green))'),
      expectedReferenceForeground: color(event.data.customColor ? 'var(--vscode-badge-foreground)' : 'var(--vscode-scmGraph-historyItemHoverLabelForeground, var(--vscode-editor-background))'),
      badgeForeground: color('var(--vscode-badge-foreground)'),
      badgeBackground: color('var(--vscode-badge-background)'),
      inactiveLabels: [...document.querySelectorAll('.gitRef:not(.active)')].map(label => {
        const style = getComputedStyle(label);
        return {type:label.className,foreground:style.color,background:style.backgroundColor,contrast:contrast(style.color,style.backgroundColor)};
      }),
      sameGraph: graphPath === firstGraphPath
    });
  });
  const timer = setInterval(() => {
    if (!api) return;
    const commits = [...document.querySelectorAll('#commitTable tr.commit')];
    if (stage === 'history') {
      const commit = commits.find(row => row.textContent.includes('Main fixture update'));
      if (commits.length !== 4 || !commit || !document.querySelector('#commitGraph svg')) return;
      rows = commits.length;
      stage = 'details';
      commit.click();
    } else {
      const details = document.querySelector('#cdv');
      if (!details || !details.textContent.includes('fixture.txt') || !details.textContent.includes('Main fixture update')) return;
      clearInterval(timer);
      firstGraphPath = document.querySelector('#commitGraph path.line');
      api.postMessage({command: '__hostTestResult', rows, graphSvg: true, commitDetailsFile: 'fixture.txt'});
    }
  }, 100);
})();
`;

async function git(args: string[]) {
	const result = Bun.spawn(['git', ...args], { cwd: repository, stdout: 'pipe', stderr: 'pipe' });
	if (await result.exited !== 0) throw new Error(await new Response(result.stderr).text());
}

try {
	await mkdir(repository);
	await git(['init', '-b', 'main']);
	await writeFile(path.join(repository, 'fixture.txt'), 'Extension host fixture\n');
	await git(['add', 'fixture.txt']);
	await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgSign=false', 'commit', '-m', 'Host smoke fixture']);
	await git(['checkout', '-b', 'feature']);
	await writeFile(path.join(repository, 'feature.txt'), 'Feature fixture\n');
	await git(['add', 'feature.txt']);
	await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgSign=false', 'commit', '-m', 'Feature fixture']);
	await git(['checkout', 'main']);
	await writeFile(path.join(repository, 'fixture.txt'), 'Updated main fixture\n');
	await git(['add', 'fixture.txt']);
	await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgSign=false', 'commit', '-m', 'Main fixture update']);
	await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgSign=false', 'merge', '--no-ff', 'feature', '-m', 'Merge fixture']);
	await git(['tag', 'fixture-tag']);
	const cacheSource = process.env['VSCODE_TEST_SERVICE_WORKER_SOURCE'];
	if (cacheSource) {
		await mkdir(profile);
		await cp(cacheSource, path.join(profile, 'Service Worker'), { recursive: true });
	}
	const themeExtension = process.env['VSCODE_TEST_THEME_EXTENSION'];
	if (themeExtension) {
		await cp(themeExtension, path.join(directory, 'extensions', path.basename(themeExtension)), { recursive: true });
		const themeName = process.env['VSCODE_TEST_THEME_NAME'];
		if (!themeName) throw new Error('Set VSCODE_TEST_THEME_NAME when copying a theme extension');
		themeNames.push(themeName);
	}
	const testFile = path.join(directory, 'run-tests.cjs');
	await writeFile(testFile, `
const assert = require('node:assert/strict');
const vscode = require('vscode');
exports.run = async () => {
  const extension = vscode.extensions.getExtension(${JSON.stringify(manifest.publisher + '.' + manifest.name)});
  assert(extension, 'Development extension was discovered');
  await extension.activate();
  assert(extension.isActive, 'Extension activated');
  if (${JSON.stringify(customPalette) ?? 'undefined'}) {
    await vscode.workspace.getConfiguration('git-graph').update('graph.colours', ${JSON.stringify(customPalette) ?? 'undefined'}, vscode.ConfigurationTarget.Global);
  }
  const {GitGraphView} = require(${JSON.stringify(path.join(extensionRoot, 'out', 'gitGraphView.js'))});
  await vscode.commands.executeCommand('git-graph.view');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const view = GitGraphView.currentPanel;
    if (view && view.loadCommitsRefreshId > 0 && view.repoFileWatcher.repo === ${JSON.stringify(repository)}) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const view = GitGraphView.currentPanel;
  assert(view, 'Graph command created a webview');
  assert(view.isGraphViewLoaded, 'Real repository appeared in generated HTML');
  assert(view.loadCommitsRefreshId > 0, 'Compiled webview requested history through the host bridge');
  assert.equal(view.repoFileWatcher.repo, ${JSON.stringify(repository)}, 'Repository watcher follows the real fixture');
  const result = await view.dataSource.getCommits(${JSON.stringify(repository)}, null, 300, true, true, false, false, 'date', [], [], []);
  assert.equal(result.error, null);
  assert.equal(result.commits.length, 4);
  assert.equal(result.commits[0].message, 'Merge fixture');
  assert.equal(result.commits[0].parents.length, 2, 'Merge parents survived real Git parsing');
  const html = view.panel.webview.html;
  const nonce = html.match(/<script nonce="([^"]+)"/)[1];
  const ui = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      listener.dispose();
      reject(new Error('Webview did not render history and commit details within 15 seconds'));
    }, 15000);
    const listener = view.panel.webview.onDidReceiveMessage(message => {
      if (message.command !== '__hostTestResult') return;
      clearTimeout(timeout);
      listener.dispose();
      resolve(message);
    });
    const probe = '<script nonce="' + nonce + '">' + ${JSON.stringify(webviewProbe)} + '</script>';
    view.panel.webview.html = html.replace('<script nonce="', probe + '<script nonce="');
  });
  assert.equal(ui.rows, 4);
  assert.equal(ui.graphSvg, true);
  assert.equal(ui.commitDetailsFile, 'fixture.txt');
  const themeSamples = [];
  async function sampleTheme(theme, expectedPrimary) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const sample = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { listener.dispose(); reject(new Error('Theme probe did not respond')); }, 3000);
        const listener = view.panel.webview.onDidReceiveMessage(message => {
          if (message.command !== '__hostThemeResult') return;
          clearTimeout(timeout);
          listener.dispose();
          resolve(message);
        });
        view.panel.webview.postMessage({command:'__hostThemeSample', customColor:${JSON.stringify(customPalette?.[0]) ?? 'undefined'}, secondaryColor:${JSON.stringify(customPalette?.[1]) ?? 'undefined'}});
      });
      if (sample.theme !== theme || (expectedPrimary && sample.stroke !== expectedPrimary)) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      assert.equal(sample.stroke, sample.expectedStroke, 'Primary lane follows the native reference color or explicit palette');
      assert(sample.secondaryStroke.includes(sample.expectedSecondaryStroke), 'Merge lane follows the native graph palette or explicit palette');
      assert.equal(sample.icon, sample.expectedIcon, 'Toolbar icon follows icon.foreground');
      assert.equal(sample.dropdown, sample.expectedDropdown, 'Dropdown follows dropdown.background');
      assert.equal(sample.background, sample.expectedBackground, 'Graph surface follows editor.background');
      assert.equal(sample.referenceBackground, sample.expectedReferenceBackground, 'Current branch label follows its native theme role');
      assert.equal(sample.referenceForeground, sample.expectedReferenceForeground, 'Current branch label uses native contrasting text');
      assert(sample.inactiveLabels.some(label=>label.type.includes('tag')), 'Real tag label was checked');
      assert(sample.inactiveLabels.some(label=>label.type.includes('head')), 'Inactive branch label was checked');
      for (const label of sample.inactiveLabels) {
        assert.equal(label.foreground, sample.badgeForeground, 'Badge text uses the paired badge foreground');
        assert.equal(label.background, sample.badgeBackground, 'Badge background uses the paired badge background');
        assert(label.contrast >= 4.5, 'Inactive label text contrast is at least 4.5:1 in the tested theme');
      }
      assert.equal(sample.sameGraph, true, 'Theme updates preserve graph DOM');
      return sample;
    }
    throw new Error('Theme or color customization did not reach the webview: ' + theme);
  }
  for (const theme of ${JSON.stringify(themeNames)}) {
    await vscode.workspace.getConfiguration('workbench').update('colorTheme', theme, vscode.ConfigurationTarget.Global);
    themeSamples.push(await sampleTheme(theme));
  }
  if (!${Boolean(customPalette)}) {
    const theme = ${JSON.stringify(themeNames.at(-1))};
    await vscode.workspace.getConfiguration('workbench').update('colorCustomizations', {'scmGraph.historyItemRefColor':'#123456'}, vscode.ConfigurationTarget.Global);
    await sampleTheme(theme, 'rgb(18, 52, 86)');
    await vscode.workspace.getConfiguration('workbench').update('colorCustomizations', {'scmGraph.historyItemRefColor':'#abcdef'}, vscode.ConfigurationTarget.Global);
    await sampleTheme(theme, 'rgb(171, 205, 239)');
  }
  console.log('THEME_SMOKE_OK ' + JSON.stringify({themes:themeSamples.map(sample => ({theme:sample.theme,kind:sample.kind,stroke:sample.stroke,icon:sample.icon,dropdown:sample.dropdown,sameGraph:sample.sameGraph,inactiveLabels:sample.inactiveLabels})),liveColorCustomizations:${!customPalette},customPalette:${Boolean(customPalette)}}));
  console.log('HOST_SMOKE_OK ' + JSON.stringify({vscode:vscode.version,node:process.versions.node,commits:result.commits.length,webviewRequestedHistory:true,renderedRows:ui.rows,graphSvg:ui.graphSvg,commitDetailsFile:ui.commitDetailsFile,copiedServiceWorkerCache:${Boolean(cacheSource)}}));
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
};
`);
	await runTests({
		version: manifest.engines.vscode.slice(1),
		vscodeExecutablePath: process.env['VSCODE_EXECUTABLE_PATH'],
		extensionDevelopmentPath: extensionRoot,
		extensionTestsPath: testFile,
		extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined },
		launchArgs: [repository, '--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-telemetry', '--user-data-dir=' + profile, '--extensions-dir=' + path.join(directory, 'extensions')]
	});
} finally {
	await rm(directory, { recursive: true, force: true });
}
