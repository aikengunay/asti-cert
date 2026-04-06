#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const cli = path.join(__dirname, '..', 'cli.js');
const logPath = path.join(__dirname, '..', 'smoke-check.log');

const lines = [];

function ok(m) {
  lines.push('OK: ' + m);
}
function fail(m) {
  lines.push('FAIL: ' + m);
  process.exitCode = 1;
}

try {
  require('child_process').execSync(`node --check "${cli}"`, { stdio: 'pipe' });
  ok('node --check cli.js');
} catch (e) {
  fail('syntax: ' + e.message);
}

const ver = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
if (ver.status !== 0) fail('--version exit ' + ver.status);
else if (!String(ver.stdout + ver.stderr).includes('asti-cert v')) fail('--version output');
else ok('--version');

const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
if (help.status !== 0) fail('--help exit');
else if (!String(help.stdout).includes('Usage: asti-cert')) fail('--help content');
else ok('--help');

fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8');
