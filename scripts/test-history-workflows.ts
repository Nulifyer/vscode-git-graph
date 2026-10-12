import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';
import manifest from '../package.json';

const root = path.resolve(import.meta.dir, '..');
const extensionRoot = path.resolve(process.env['EXTENSION_UNDER_TEST'] ?? root);
const directory = await mkdtemp(path.join(os.tmpdir(), 'git-graph-workflow-host-'));
const repo = path.join(directory, 'repo');
const worktree = path.join(directory, 'spare');
async function git(args: string[], stdin?: string) {
	const process = Bun.spawn(['git', ...args], { cwd: repo, stdin: stdin ? new Blob([stdin]) : undefined, stdout: 'pipe', stderr: 'pipe' });
	const output = await new Response(process.stdout).text();
	if (await process.exited) throw new Error(await new Response(process.stderr).text());
	return output;
}

const probe = `
(() => {
  const acquire = window.acquireVsCodeApi; let api, stateWrites=0;
  window.acquireVsCodeApi = () => { const original=acquire(); api={...original,setState:state=>{ stateWrites++; return original.setState(state); }}; api.postMessage({command:'__workflowProgress',stage:'webview acquired API'}); return api; };
  const sleep = () => new Promise(resolve => setTimeout(resolve, 40));
  const wait = async (check, name) => { api?.postMessage({command:'__workflowProgress',stage:name}); const deadline = Date.now()+30000; while(Date.now()<deadline) { const result=check(); if(result) return result; await sleep(); } throw new Error('Timed out: '+name); };
  const require = (test, name) => { if (!test) throw new Error(name); };
  const button = (name, parent=document) => [...parent.querySelectorAll('button')].find(button=>button.textContent===name || button.getAttribute('aria-label')===name);
  const click = name => {
    let element=button(name);
    if(!element) {
      button('More actions').click();
      element=[...document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent.replace(/…$/,'')===name);
    }
    require(element,'Missing action: '+name); element.click();
  };
  const input = (name,value) => { const element=document.querySelector('dialog[open] [name="'+name+'"]'); require(element,'Missing input: '+name); element.value=value; element.dispatchEvent(new Event('input',{bubbles:true})); };
  const submit = () => document.querySelector('dialog[open] form').requestSubmit();
  const total = () => Number(document.getElementById('commitTable')?.dataset.totalCommits||0);
  const rows = () => [...document.querySelectorAll('#commitTable tr.commit')];
  const frames = () => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const samples=[];
  async function run() {
    await wait(()=>total()===300,'initial page');
    require(!document.querySelector('.modernToolbar'),'No extra row of text buttons');
    require(document.querySelector('.workflowToolbar').children.length===7,'Actions use one compact toolbar');
    document.getElementById('loadMoreCommitsBtn').click();
    await wait(()=>total()===1005,'complete fixture');
    const view=document.getElementById('view');
    for(const fraction of [0,.5,1]) {
      view.scrollTo({top:(view.scrollHeight-view.clientHeight)*fraction,behavior:'instant'}); await frames();
      require(rows().length<100,'Viewport renders fewer than 100 rows');
      require(document.querySelectorAll('#commitGraph svg *').length<400,'SVG stays bounded');
      const row=rows().find(row=>row.getBoundingClientRect().top>=view.getBoundingClientRect().top+30);
      require(row,'Visible row exists');
      const vertex=document.querySelector('#commitGraph circle[data-id="'+row.dataset.id+'"]');
      require(vertex,'Visible row has a graph vertex');
      require(Math.abs(vertex.getBoundingClientRect().top+4-(row.getBoundingClientRect().top+12))<2,'Graph vertices align with table rows');
      samples.push({fraction,rows:rows().length,svg:document.querySelectorAll('#commitGraph svg *').length});
    }
    require(rows().at(-1).dataset.id==='1004','Oldest row appears at bottom');
    const last=rows().at(-1); last.focus(); last.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})); await frames();
    require(document.activeElement.dataset.id==='0','Keyboard Home reveals first commit');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}));
    require(document.querySelector('[role=menu] [role=menuitem]')===document.activeElement,'Keyboard context menu focuses its first action');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    require(!document.querySelector('[role=menu]'),'Keyboard Escape closes context menu');
    document.getElementById('findBtn').click(); const find=document.getElementById('findInput'); find.value='infullhis'; find.dispatchEvent(new KeyboardEvent('keyup',{key:'s',bubbles:true}));
    await wait(()=>document.getElementById('findPosition').textContent==='1 of 1','fuzzy Find');
    require(document.querySelector('.findCurrentCommit').dataset.id==='1004','Fuzzy Find reaches a distant commit');
    require(document.querySelector('.findMatch'),'Fuzzy character highlights render');
    const writes=stateWrites;
    for (const fraction of [.3,.6,.9]) { view.scrollTo({top:view.scrollHeight*fraction,behavior:'instant'}); await frames(); }
    require(stateWrites-writes<=1,'Searching while scrolling does not serialize history on each frame');
    document.getElementById('findClose').click();
    view.scrollTo({top:view.scrollHeight,behavior:'instant'}); await frames();
    rows().at(-1).click(); await wait(()=>document.getElementById('cdv')?.textContent.includes('original.txt'),'distant commit details');
    view.scrollTo({top:0,behavior:'instant'}); await frames();
    require(document.getElementById('cdv')?.textContent.includes('original.txt'),'Details survive scrolling offscreen');
    const first=await wait(()=> { view.scrollTo({top:0,behavior:'instant'}); return rows().find(row=>row.dataset.id==='0'); },'first comparison commit'); first.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));
    await wait(()=>document.getElementById('cdvSummary')?.textContent.includes('Displaying all changes'),'distant comparison');
    document.getElementById('cdvCodeReview').click(); await wait(()=>document.getElementById('cdvCodeReview')?.classList.contains('active'),'comparison code review');
    view.scrollTo({top:view.scrollHeight*.45,behavior:'instant'}); await frames();
    require(rows().filter(row=>row.classList.contains('commitDetailsOpen')).length===2,'Both comparison anchors remain rendered');
    require(document.getElementById('cdvSummary')?.textContent.includes('Displaying all changes'),'Comparison survives virtual scroll');
    require(document.getElementById('cdvCodeReview')?.classList.contains('active'),'Code review survives virtual scroll');
    document.getElementById('cdvCodeReview').click();
    document.getElementById('cdvClose').click();
    click('Layout');
    for(const branch of ['main','feature']) { const picker=document.querySelector('[name=branch]'); picker.value=branch; picker.dispatchEvent(new Event('change')); }
    const marker=document.querySelector('.workflowCheck .customCheckbox'); require(marker.getBoundingClientRect().width>=16,'Collapse checkbox indicator is visible');
    document.querySelector('.workflowCheck').click(); submit();
    await wait(()=>total()<20,'collapsed history');
    require(document.querySelector('.expandHistoryGroup'),'Collapsed group has an expand control');
    const current=[...document.querySelectorAll('.gitRef.active')][0]?.closest('tr');
    const currentVertex=document.querySelector('#commitGraph circle[data-id="'+current.dataset.id+'"]');
    require(Number(currentVertex.getAttribute('cx'))===16,'Main branch is pinned to lane zero, actual '+currentVertex.getAttribute('cx'));
    const feature=[...document.querySelectorAll('.gitRef.head')].find(label=>label.dataset.name==='feature').closest('tr');
    const featureVertex=document.querySelector('#commitGraph circle[data-id="'+feature.dataset.id+'"]');
    require(Number(featureVertex.getAttribute('cx'))===32,'Feature branch is pinned to lane one');
    feature.click(); await wait(()=>document.getElementById('cdv')?.textContent.includes('feature.txt'),'pinned commit details');
    click('Highlight selected ancestry');
    require(document.querySelector('.pathMuted'),'Non-ancestor rows dim');
    require([...document.querySelectorAll('#commitGraph path.line')].some(path=>path.style.opacity==='.25' || path.style.opacity==='0.25'),'Non-ancestor graph paths dim');
    document.getElementById('cdvClose').click();
    [...document.querySelectorAll('.expandHistoryGroup')].sort((a,b)=>parseInt(b.closest('tr').querySelector('.text').textContent)-parseInt(a.closest('tr').querySelector('.text').textContent))[0].click(); await wait(()=>total()>500,'expanded history');
    click('Layout'); document.querySelector('[name=collapsed]').checked=false; submit();
    await wait(()=>total()===1005,'uncollapsed history');
    click('Search history'); input('query','infullhis'); submit();
    await wait(()=>document.querySelector('.historyResult')?.textContent.includes('Initial full history fixture'),'repository fuzzy result');
    require(document.querySelector('.historyResult .fuzzyMatch'),'Repository fuzzy results highlight matches');
    click('Close');
    click('File history'); input('file','renamed.txt'); submit();
    await wait(()=>document.querySelector('.historyResults')?.textContent.includes('Initial full history fixture'),'rename-aware history'); click('Close');
    click('Worktrees'); await wait(()=>document.querySelector('.worktreeRow'),'worktree list'); input('path',${JSON.stringify(worktree)}); input('reference','spare'); submit();
    await wait(()=>document.querySelector('.workflowStatus')?.textContent==='2 worktrees','worktree creation');
    click('Remove'); await wait(()=>button('Confirm'),'remove confirmation'); click('Confirm');
    await wait(()=>document.querySelector('.workflowStatus')?.textContent==='1 worktrees','worktree removal'); click('Close');
    click('Visual rebase'); submit();
    // The initial default range includes a merge. Validation must not rewrite it.
    await wait(()=>document.querySelector('.workflowStatus')?.textContent.includes('contains merges'),'merge range refusal');
    input('base','HEAD~2'); submit(); await wait(()=>document.querySelectorAll('.rebaseRow').length===2,'linear rebase plan');
    require(document.querySelector('.rebaseRow select').getBoundingClientRect().width<=100,'Rebase actions stay in a compact column');
    require(!document.querySelector('.workflowStatus[data-kind=error]'),'Valid plans clear earlier validation styling');
    let actions=document.querySelectorAll('.rebaseRow select'); actions[0].value='reword'; actions[0].dispatchEvent(new Event('change'));
    input('base','HEAD~2'); const message=document.querySelector('.rebaseRow textarea'); message.value='Host reworded commit'; message.dispatchEvent(new Event('input'));
    actions=document.querySelectorAll('.rebaseRow select'); actions[1].value='fixup'; actions[1].dispatchEvent(new Event('change'));
    click('Start rebase'); await wait(()=>button('Confirm'),'rebase confirmation'); click('Confirm');
    await wait(()=>!document.querySelector('dialog[open]'),'rebase completed');
    api.postMessage({command:'__fixtureMergeConflict'});
    await wait(()=>document.querySelector('.operationBanner')?.textContent.includes('1 unresolved files'),'conflict banner');
    require(button('Open merge editor'),'Native merge editor action exists');
    click('Abort merge'); await wait(()=>button('Confirm'),'abort confirmation'); click('Confirm');
    await wait(()=>document.querySelector('.operationBanner').hidden,'conflict abort');
    api.postMessage({command:'__workflowResult',samples,passed:true});
  }
  let started=false;
  window.addEventListener('message',event=> { if(event.data.command==='__runWorkflowChecks' && api && total() && !started) { started=true; run().catch(error=>api.postMessage({command:'__workflowResult',error:String(error),samples})); } });
})();
`;

try {
	await mkdir(repo);
	await git(['init', '-b', 'main']);
	await git(['config', 'user.name', 'Fixture']); await git(['config', 'user.email', 'fixture@example.test']); await git(['config', 'commit.gpgSign', 'false']);
	let imported = 'blob\nmark :1\ndata 8\ninitial\n\n';
	for (let i = 0; i < 1000; i++) {
		const message = i === 0 ? 'Initial full history fixture' : 'History fixture ' + i;
		imported += 'commit refs/heads/main\nmark :' + (i + 2) + '\ncommitter Fixture <fixture@example.test> ' + (1700000000 + i) + ' +0000\ndata ' + Buffer.byteLength(message) + '\n' + message + '\n' + (i ? 'from :' + (i + 1) + '\n' : 'M 100644 :1 original.txt\n') + (i === 300 ? 'R original.txt renamed.txt\n' : '') + '\n';
	}
	await git(['fast-import', '--quiet'], imported); await git(['reset', '--hard', 'HEAD']);
	await git(['branch', 'spare', 'HEAD~999']); await git(['checkout', '-b', 'feature', 'HEAD~5']);
	await writeFile(path.join(repo, 'feature.txt'), 'feature\n'); await git(['add', '.']); await git(['commit', '-m', 'Feature fixture']);
	await git(['checkout', 'main']); await writeFile(path.join(repo, 'main.txt'), 'main\n'); await git(['add', '.']); await git(['commit', '-m', 'Main fixture']);
	await git(['merge', '--no-ff', 'feature', '-m', 'Merge fixture']);
	for (const name of ['one', 'two']) { await writeFile(path.join(repo, name + '.txt'), name + '\n'); await git(['add', '.']); await git(['commit', '-m', name + ' fixture']); }
	const profile = path.join(directory, 'profile'); await mkdir(path.join(profile, 'User'), { recursive: true });
	await writeFile(path.join(profile, 'User', 'settings.json'), JSON.stringify({ 'git.enabled': false, 'git-graph.repository.commits.loadMore': 1000, 'git-graph.repository.commits.loadMoreAutomatically': false, 'git-graph.commitDetailsView.autoCenter': false }));
	const test = path.join(directory, 'test.cjs');
	await writeFile(test, `
const assert=require('node:assert/strict'), vscode=require('vscode'), fs=require('node:fs'), {execFileSync}=require('node:child_process');
exports.run=async()=> {
  console.log('WORKFLOW_PROGRESS host started');
  await vscode.extensions.getExtension(${JSON.stringify(manifest.publisher + '.' + manifest.name)}).activate();
  console.log('WORKFLOW_PROGRESS activated');
  await vscode.commands.executeCommand('git-graph.view');
  console.log('WORKFLOW_PROGRESS opened graph');
  const {GitGraphView}=require(${JSON.stringify(path.join(extensionRoot, 'out', 'gitGraphView.js'))});
  const view=GitGraphView.currentPanel;
  const deadline=Date.now()+20000;
  while(!view.isGraphViewLoaded || !view.loadCommitsRefreshId) { if(Date.now()>deadline) throw new Error('Repository did not load'); await new Promise(resolve=>setTimeout(resolve,100)); }
  const html=view.panel.webview.html, nonce=html.match(/<script nonce="([^"]+)"/)[1];
  const result=await new Promise((resolve,reject)=> {
    const timer=setTimeout(()=>reject(new Error('Workflow webview tests timed out')),180000);
    const start=setInterval(()=>view.panel.webview.postMessage({command:'__runWorkflowChecks'}),1000);
    const listener=view.panel.webview.onDidReceiveMessage(message=> {
      if(message.command==='__fixtureMergeConflict') {
        const cwd=${JSON.stringify(repo)};
        const git=args=>execFileSync('git',args,{cwd,encoding:'utf8'});
        assert.equal(git(['log','-1','--format=%s']).trim(),'Host reworded commit');
        git(['checkout','-b','conflict-fixture']); fs.writeFileSync(cwd+'/main.txt','feature conflict\\n'); git(['add','main.txt']); git(['commit','-m','Conflict feature']);
        git(['checkout','main']); fs.writeFileSync(cwd+'/main.txt','main conflict\\n'); git(['add','main.txt']); git(['commit','-m','Conflict main']);
        assert.throws(()=>git(['merge','conflict-fixture']));
      }
      if(message.command==='__workflowProgress') console.log('WORKFLOW_PROGRESS '+message.stage); if(message.command==='__workflowResult') { clearTimeout(timer); clearInterval(start); listener.dispose(); resolve(message); } });
    view.panel.webview.html=html.replace('<script nonce="','<script nonce="'+nonce+'">'+${JSON.stringify(probe)}+'</script><script nonce="');

  });
  assert.equal(result.error,undefined,result.error);
  assert.equal(result.passed,true);
  assert.equal(execFileSync('git',['log','-1','--format=%s'],{cwd:${JSON.stringify(repo)},encoding:'utf8'}).trim(),'Conflict main');
  console.log('WORKFLOW_HOST_OK '+JSON.stringify(result));
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
};
`);
	await runTests({ version: manifest.engines.vscode.slice(1), vscodeExecutablePath: process.env['VSCODE_EXECUTABLE_PATH'], extensionDevelopmentPath: extensionRoot, extensionTestsPath: test, extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined }, launchArgs: [repo, '--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--disable-telemetry', '--user-data-dir=' + profile, '--extensions-dir=' + path.join(directory, 'extensions')] });
} finally { await rm(directory, { recursive: true, force: true }); }
