import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

if (!process.argv[2]) throw new Error('Usage: bun scripts/profile-history.ts /path/to/repository');
const repository = path.resolve(process.argv[2]);
const extensionRoot = path.resolve(process.env['EXTENSION_UNDER_TEST'] ?? path.resolve(import.meta.dir, '..'));
const output = path.resolve(process.env['HISTORY_PROFILE_OUTPUT'] ?? '.agents/evidence/history-profile.json');
const increment = Number(process.env['HISTORY_LOAD_INCREMENT'] ?? 100);
const maximumRows = Number(process.env['HISTORY_MAX_ROWS'] ?? 30000);
const directory = await mkdtemp(path.join(os.tmpdir(), 'git-graph-perf-'));
const manifest = JSON.parse(await readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
const profile = path.join(directory, 'profile');

const probe = `
(() => {
  let api, requestStarted = 0, scrollStarted = 0;
  const acquire = window.acquireVsCodeApi;
  window.acquireVsCodeApi = () => {
    const acquired = acquire();
    const post = acquired.postMessage.bind(acquired);
    api = {...acquired, postMessage: message => {
      if (message.command === 'loadCommits') requestStarted = performance.now();
      return post(message);
    }};
    return api;
  };
  const tasks = [];
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) tasks.push(entry.duration);
  }).observe({type:'longtask', buffered:true});
  const send = message => api.postMessage(message);
  const add = window.addEventListener;
  const colorChannels = value => (value.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  const contrast = (foreground, background) => {
    const luminance = value => {
      const channels = colorChannels(value).map(v => {v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;});
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  };
  const labels = () => [...document.querySelectorAll('.gitRef')].slice(0, 16).map(label => {
    const style = getComputedStyle(label);
    return {type:label.className,text:label.textContent.slice(0,100),foreground:style.color,background:style.backgroundColor,contrast:contrast(style.color,style.backgroundColor)};
  });
  window.addEventListener = function(type, listener, options) {
    if (type !== 'message' || typeof listener !== 'function') return add.call(this,type,listener,options);
    return add.call(this,type,event => {
      const start = performance.now();
      listener.call(this,event);
      if (event.data.command !== 'loadCommits' || event.data.error) return;
      const renderHandlerMs = performance.now() - start;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const rows = document.querySelectorAll('#commitTable tr.commit');
        if (rows.length !== event.data.commits.length) return;
        const frameReadyAt = performance.now();
        send({command:'__historyBatch',rows:rows.length,more:event.data.moreCommitsAvailable,refreshId:event.data.refreshId,
          renderHandlerMs,requestToFramesMs:frameReadyAt-requestStarted,scrollToFramesMs:scrollStarted ? frameReadyAt-scrollStarted : null,
          domElements:document.querySelectorAll('*').length,svgElements:document.querySelectorAll('#commitGraph svg *').length,
          height:document.getElementById('view').scrollHeight,jsHeapBytes:performance.memory?.usedJSHeapSize ?? null,
          firstHash:event.data.commits[0]?.hash,lastHash:event.data.commits.at(-1)?.hash,
          normalCommits:event.data.commits.filter(commit=>commit.hash!=='*').length,
          labels:labels(),longTasks:{count:tasks.length,totalMs:tasks.reduce((a,b)=>a+b,0),maxMs:Math.max(0,...tasks)}});
      }));
    }, options);
  };
  add.call(window,'message',async event => {
    if (!api) return;
    const view = document.getElementById('view');
    if (event.data.command === '__historyScrollBottom') {
      scrollStarted = performance.now();
      view.scrollTo({top:view.scrollHeight,behavior:'instant'});
    }
    if (event.data.command === '__historyScrollSample') {
      const intervals = [];
      let previous = await new Promise(resolve=>requestAnimationFrame(resolve));
      for (let i=0;i<48;i++) {
        // Stay away from the end while measuring intermediate scroll frames.
        view.scrollTop = (view.scrollHeight-view.clientHeight)*(.1 + (i%8)*.1);
        const current = await new Promise(resolve=>requestAnimationFrame(resolve));
        intervals.push(current-previous); previous=current;
      }
      intervals.sort((a,b)=>a-b);
      send({command:'__historyScrollResult',rows:document.querySelectorAll('#commitTable tr.commit').length,
        frameMs:{p50:intervals[24],p95:intervals[45],max:intervals.at(-1)},jsHeapBytes:performance.memory?.usedJSHeapSize ?? null});
    }
    if (event.data.command === '__historyFinish') {
      view.scrollTo({top:view.scrollHeight,behavior:'instant'});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const rows=document.querySelectorAll('#commitTable tr.commit');
      const last=rows[rows.length-1].getBoundingClientRect(), bounds=view.getBoundingClientRect();
      send({command:'__historyFinished',rows:rows.length,atBottom:view.scrollTop+view.clientHeight>=view.scrollHeight-2,
        oldestRowVisible:last.top<bounds.bottom && last.bottom>bounds.top,
        moreButtonPresent:!!document.getElementById('loadMoreCommitsBtn'),labels:labels(),height:view.scrollHeight});
    }
  });
})();
`;

try {
	await mkdir(path.dirname(output), { recursive: true });
	await mkdir(path.join(profile, 'User'), { recursive: true });
	await writeFile(path.join(profile, 'User', 'settings.json'), JSON.stringify({
		'git.enabled': false,
		'git.autofetch': false,
		'git-graph.repository.commits.initialLoad': 300,
		'git-graph.repository.commits.loadMore': increment,
		'git-graph.repository.commits.loadMoreAutomatically': true,
		'git-graph.repository.commits.fetchAvatars': false,
		'workbench.colorTheme': process.env['VSCODE_TEST_THEME_NAME'] ?? 'Dark Modern'
	}));
	const theme = process.env['VSCODE_TEST_THEME_EXTENSION'];
	if (theme) await cp(theme, path.join(directory, 'extensions', path.basename(theme)), { recursive: true });
	const testFile = path.join(directory, 'profile.cjs');
	await writeFile(testFile, `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vscode = require('vscode');
exports.run = async () => {
  const started = Date.now(), batches = [], scrollSamples = [], gitRequests = [];
  let listener, view, failure = null, finished = null;
  const report = () => fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({repository:${JSON.stringify(repository)},version:${JSON.stringify(manifest.version)},vscode:vscode.version,node:process.versions.node,
    increment:${increment},maximumRows:${maximumRows},elapsedMs:Date.now()-started,batches,scrollSamples,gitRequests,finished,failure,
    method:'Installed extension in isolated VS Code; real scroll events trigger automatic paging. Handler timing excludes instrumentation DOM sampling. Double requestAnimationFrame measures layout/frame readiness, not physical display latency. JS heap excludes native DOM memory.'},null,2)+'\\n');
  const wait = async (predicate,label,timeout=60000) => {
    const deadline=Date.now()+timeout;
    while(!predicate()) {if(Date.now()>deadline)throw new Error('Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,50));}
  };
  const command = async (request,response,timeout=60000) => {
    let result;
    const tap=view.panel.webview.onDidReceiveMessage(message=>{if(message.command===response)result=message;});
    try {await view.panel.webview.postMessage({command:request});await wait(()=>result,response,timeout);return result;}
    finally {tap.dispose();}
  };
  try {
    const extension=vscode.extensions.getExtension(${JSON.stringify(manifest.publisher + '.' + manifest.name)});
    assert(extension);await extension.activate();
    const {GitGraphView}=require(${JSON.stringify(path.join(extensionRoot, 'out', 'gitGraphView.js'))});
    await vscode.commands.executeCommand('git-graph.view');
    await wait(()=>GitGraphView.currentPanel?.isGraphViewLoaded,'repository discovery');
    view=GitGraphView.currentPanel;
    const getCommits=view.dataSource.getCommits.bind(view.dataSource);
    view.dataSource.getCommits=async (...args)=>{
      const begin=performance.now();const result=await getCommits(...args);
      gitRequests.push({limit:args[2],returned:result.commits.length,ms:performance.now()-begin,error:result.error});
      return result;
    };
    listener=view.panel.webview.onDidReceiveMessage(message=>{
      if(message.command!=='__historyBatch')return;
      if(batches.some(batch=>batch.refreshId===message.refreshId))return;
      batches.push(message);report();
      console.log('HISTORY_BATCH '+JSON.stringify({rows:message.rows,more:message.more,renderHandlerMs:message.renderHandlerMs,requestToFramesMs:message.requestToFramesMs,domElements:message.domElements}));
    });
    const html=view.panel.webview.html,nonce=html.match(/<script nonce="([^"]+)"/)[1];
    const script='<script nonce="'+nonce+'">'+${JSON.stringify(probe)}+'</script>';
    view.panel.webview.html=html.replace('<script nonce="',script+'<script nonce="');
    await wait(()=>batches.length>0,'first rendered batch');
    let lastSampleRows=0;
    while(true) {
      const batch=batches.at(-1);
      if(lastSampleRows===0 || batch.rows-lastSampleRows>=1000 || !batch.more) {
        scrollSamples.push(await command('__historyScrollSample','__historyScrollResult'));lastSampleRows=batch.rows;report();
      }
      if(!batch.more || batch.rows>=${maximumRows})break;
      const count=batches.length;
      await view.panel.webview.postMessage({command:'__historyScrollBottom'});
      await wait(()=>batches.length>count,'next batch after scrolling to bottom');
    }
    const allLoaded=!batches.at(-1).more;
    if(allLoaded) {
      finished=await command('__historyFinish','__historyFinished');
      assert(finished.atBottom && finished.oldestRowVisible && !finished.moreButtonPresent,'All history is loaded and the oldest row is visible');
    } else finished={allLoaded:false,reason:'Configured row limit reached',rows:batches.at(-1).rows};
    report();console.log('HISTORY_PROFILE_OK '+JSON.stringify({rows:batches.at(-1).rows,allLoaded,elapsedMs:Date.now()-started,output:${JSON.stringify(output)}}));
  } catch(error) {failure=String(error);report();throw error;}
  finally {listener?.dispose();await vscode.commands.executeCommand('workbench.action.closeAllEditors');}
};
`);
	console.log('HISTORY_PROFILE_DIRECTORY ' + directory);
	await runTests({
		version: manifest.engines.vscode.slice(1),
		vscodeExecutablePath: process.env['VSCODE_EXECUTABLE_PATH'],
		extensionDevelopmentPath: extensionRoot,
		extensionTestsPath: testFile,
		extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined, GIT_OPTIONAL_LOCKS: '0' },
		launchArgs: [repository, '--disable-workspace-trust', '--disable-telemetry', '--disable-renderer-backgrounding', '--enable-precise-memory-info', '--user-data-dir=' + profile, '--extensions-dir=' + path.join(directory, 'extensions')]
	});
} finally {
	await rm(directory, { recursive: true, force: true });
}
