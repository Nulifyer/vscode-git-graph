import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';
import manifest from '../package.json';

const root = path.resolve(import.meta.dir, '..');
const extensionRoot = path.resolve(process.env['EXTENSION_UNDER_TEST'] ?? root);
const directory = await mkdtemp(path.join(os.tmpdir(), 'git-graphity-host-'));
const repository = path.join(directory, 'repository');
const profile = path.join(directory, 'profile');
const previewDirectory = process.env['VSCODE_TEST_UI_PREVIEW_DIR'] ? path.resolve(process.env['VSCODE_TEST_UI_PREVIEW_DIR']) : null;
const previewVariables = previewDirectory ? [...new Set((await readFile(path.join(extensionRoot, 'media', 'out.min.css'), 'utf8')).match(/--vscode-[\w-]+/g))] : [];
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
    if(!api || event.data.command !== '__hostDialogSample') return;
    document.getElementById('workflowMoreBtn').click();
    [...document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent==='Layout…').click();
    const dialog=document.querySelector('dialog[open]'), primary=dialog.querySelector('.workflowButton.primary'), checkbox=dialog.querySelector('[name=collapsed]'), indicator=dialog.querySelector('.customCheckbox'), picker=dialog.querySelector('#pinnedBranchPicker');
    const bounds=dialog.getBoundingClientRect(), style=getComputedStyle(primary);
    const before=checkbox.checked; dialog.querySelector('.workflowCheck').click(); const toggled=checkbox.checked!==before; dialog.querySelector('.workflowCheck').click();
    const layoutResult={theme:document.body.dataset.vscodeThemeId,width:bounds.width,centered:Math.abs(bounds.left+bounds.width/2-innerWidth/2)<1 && Math.abs(bounds.top+bounds.height/2-innerHeight/2)<1,
      primaryBackground:style.backgroundColor,expectedPrimaryBackground:color('var(--vscode-button-background)'),primaryForeground:style.color,expectedPrimaryForeground:color('var(--vscode-button-foreground)'),
      checkboxWidth:checkbox.getBoundingClientRect().width,indicatorWidth:indicator.getBoundingClientRect().width,toggled,pickerWidth:picker.getBoundingClientRect().width,
      noTextarea:!dialog.querySelector('textarea'),footerActions:!!primary.closest('footer'),toolbarHeight:document.querySelector('.workflowToolbar').clientHeight,controlsHeight:document.getElementById('controls').clientHeight,
      toolbarSingleRow:[...document.querySelector('.workflowToolbar').children].filter(child=>getComputedStyle(child).display!=='none').every(child=>Math.abs(child.getBoundingClientRect().top-document.querySelector('.workflowToolbar').getBoundingClientRect().top)<1)};
    dialog.querySelector('header [aria-label=Close]').click();
    document.getElementById('settingsBtn').click();
    document.getElementById('editRepoName').click();
    const legacy=document.querySelector('.dialog'), action=legacy.querySelector('#dialogAction'), cancel=legacy.querySelector('#dialogSecondaryAction'), legacyBounds=legacy.getBoundingClientRect();
    const footer=legacy.querySelector('.dialogFooter');
    cancel.focus(); cancel.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
    const focusContained=legacy.contains(document.activeElement);
    const legacyResult={width:legacyBounds.width,centered:Math.abs(legacyBounds.left+legacyBounds.width/2-innerWidth/2)<1 && Math.abs(legacyBounds.top+legacyBounds.height/2-innerHeight/2)<1,
      role:legacy.getAttribute('role'),buttons:action.tagName==='BUTTON' && cancel.tagName==='BUTTON',footerActions:footer.contains(action)&&footer.contains(cancel),
      primaryBackground:getComputedStyle(action).backgroundColor,primaryForeground:getComputedStyle(action).color,borderRadius:getComputedStyle(action).borderRadius,
      focusContained,noHorizontalOverflow:legacy.scrollWidth<=legacy.clientWidth};
    const validation=document.createElement('div');validation.className='workflowStatus';validation.dataset.kind='error';validation.textContent='Search failed. Try again.';
    document.body.append(validation);
    const validationStyle=getComputedStyle(validation);
    legacyResult.errorContrast=contrast(validationStyle.color,validationStyle.backgroundColor);
    validation.remove();
    cancel.click(); document.getElementById('settingsClose').click();
    api.postMessage({command:'__hostDialogResult',...layoutResult,legacy:legacyResult});
  });
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
      cssTokens: Object.fromEntries((event.data.previewVariables || []).map(name => [name, getComputedStyle(document.body).getPropertyValue(name).trim()])),
      font: getComputedStyle(document.body).font,
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
const fs = require('node:fs');
const vscode = require('vscode');
exports.run = async () => {
  const extension = vscode.extensions.getExtension(${JSON.stringify(manifest.publisher + '.' + manifest.name)});
  assert(extension, 'Development extension was discovered');
  await extension.activate();
  assert(extension.isActive, 'Extension activated');
  if (${JSON.stringify(customPalette) ?? 'undefined'}) {
    await vscode.workspace.getConfiguration('git-graphity').update('graph.colours', ${JSON.stringify(customPalette) ?? 'undefined'}, vscode.ConfigurationTarget.Global);
  }
  const {GitGraphityView} = require(${JSON.stringify(path.join(extensionRoot, 'out', 'gitGraphityView.js'))});
  await vscode.commands.executeCommand('git-graphity.view');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const view = GitGraphityView.currentPanel;
    if (view && view.loadCommitsRefreshId > 0 && view.repoFileWatcher.repo === ${JSON.stringify(repository)}) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const view = GitGraphityView.currentPanel;
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
  const themeSamples = [], dialogSamples=[];
  const sampleDialog = () => new Promise((resolve,reject)=> {
    const timeout=setTimeout(()=> { listener.dispose(); reject(new Error('Workflow dialog probe did not respond')); },5000);
    const listener=view.panel.webview.onDidReceiveMessage(message=> {
      if(message.command!=='__hostDialogResult')return;
      clearTimeout(timeout);listener.dispose();resolve(message);
    });
    view.panel.webview.postMessage({command:'__hostDialogSample'});
  });
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
        view.panel.webview.postMessage({command:'__hostThemeSample', customColor:${JSON.stringify(customPalette?.[0]) ?? 'undefined'}, secondaryColor:${JSON.stringify(customPalette?.[1]) ?? 'undefined'},previewVariables:[...new Set([...${JSON.stringify(previewVariables)},...(html.match(/--vscode-[\\w-]+/g)||[])])]});
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
    const dialog=await sampleDialog();
    assert.equal(dialog.primaryBackground,dialog.expectedPrimaryBackground,'Primary action uses the theme button background');
    assert.equal(dialog.primaryForeground,dialog.expectedPrimaryForeground,'Primary action uses the paired theme foreground');
    assert.equal(dialog.legacy.width,440,'Existing Git action dialogs have the shared width');
    assert.equal(dialog.legacy.centered,true,'Existing dialogs are centered');
    assert.equal(dialog.legacy.buttons,true,'Existing actions use keyboard-accessible buttons');
    assert.equal(dialog.legacy.role,'dialog');
    assert.equal(dialog.legacy.footerActions,true);
    assert.equal(dialog.legacy.focusContained,true,'Tab keeps focus inside the dialog');
    assert.equal(dialog.legacy.noHorizontalOverflow,true);
    assert.equal(dialog.legacy.borderRadius,'2px','Existing actions use workbench button corners');
    assert.equal(dialog.legacy.primaryBackground,dialog.expectedPrimaryBackground);
    assert.equal(dialog.legacy.primaryForeground,dialog.expectedPrimaryForeground);
    assert(dialog.legacy.errorContrast>=4.5,'Workflow error text is readable in each theme');
    assert(dialog.centered && dialog.width===440,'Layout dialog is centered and compact');
    assert(dialog.checkboxWidth===16 && dialog.indicatorWidth===16 && dialog.toggled,'Visible checkbox has a working 16px input target');
    assert(dialog.noTextarea && dialog.pickerWidth>350 && dialog.footerActions,'Layout uses a branch picker and footer actions');
    assert.equal(dialog.toolbarHeight,24,'Repository action toolbar stays 24px high');
    assert.equal(dialog.toolbarSingleRow,true,'Repository actions stay in one toolbar row when branch filters wrap');
    dialogSamples.push(dialog);
  }
  if (${JSON.stringify(previewDirectory)}) {
    const destination=${JSON.stringify(previewDirectory)};
    fs.mkdirSync(destination,{recursive:true});
    fs.writeFileSync(destination+'/template.html',html);
    fs.writeFileSync(destination+'/themes.json',JSON.stringify(themeSamples.map(sample=>({theme:sample.theme,kind:sample.kind,font:sample.font,cssTokens:sample.cssTokens})),null,2));
    fs.writeFileSync(destination+'/history.json',JSON.stringify(result.commits));
  }
  if (!${Boolean(customPalette)}) {
    const theme = ${JSON.stringify(themeNames.at(-1))};
    await vscode.workspace.getConfiguration('workbench').update('colorCustomizations', {'scmGraph.historyItemRefColor':'#123456'}, vscode.ConfigurationTarget.Global);
    await sampleTheme(theme, 'rgb(18, 52, 86)');
    await vscode.workspace.getConfiguration('workbench').update('colorCustomizations', {'scmGraph.historyItemRefColor':'#abcdef'}, vscode.ConfigurationTarget.Global);
    await sampleTheme(theme, 'rgb(171, 205, 239)');
  }
  console.log('THEME_SMOKE_OK ' + JSON.stringify({themes:themeSamples.map(sample => ({theme:sample.theme,kind:sample.kind,stroke:sample.stroke,icon:sample.icon,dropdown:sample.dropdown,sameGraph:sample.sameGraph,inactiveLabels:sample.inactiveLabels})),liveColorCustomizations:${!customPalette},customPalette:${Boolean(customPalette)}}));
  console.log('DIALOG_SMOKE_OK '+JSON.stringify(dialogSamples));
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
