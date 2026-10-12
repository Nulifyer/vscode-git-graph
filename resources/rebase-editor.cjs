'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const [mode, target] = process.argv.slice(2);
const planPath = process.env.GGM_REBASE_PLAN;
if (mode === 'sequence') {
 const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
 fs.writeFileSync(target, plan.entries.map(e => e.action + ' ' + e.hash).join('\n') + '\n');
} else if (mode === 'message' && planPath && fs.existsSync(planPath)) {
 const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
 let original;
 try {
  const done = execFileSync(process.env.GGM_GIT_EXECUTABLE || 'git', ['rev-parse', '--git-path', 'rebase-merge/done'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  original = fs.readFileSync(done, 'utf8').trim().split(/\r?\n/).at(-1).split(/\s+/)[1];
 } catch {}
 const entry = plan.entries.find(e => e.hash === original);
 if (entry && entry.message && ['reword', 'squash'].includes(entry.action)) fs.writeFileSync(target, entry.message.trim() + '\n');
}
