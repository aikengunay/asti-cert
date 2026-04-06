#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');

const DOMAIN = '@asti.dost.gov.ph';
const DEFAULT_P12_PASSWORD = 'password';
const MIN_CUSTOM_PASSWORD_LENGTH = 8;

const FIXED = {
  C: 'PH',
  ST: 'National Capital Region',
  L: 'Quezon City',
  O: 'DOST-ASTI',
};

const DEPARTMENTS = [
  'Office of the Director',
  'Research and Development Division',
  'Solutions and Services Engineering Division',
  'Knowledge Management Division',
  'Finance and Administrative Division',
  'Computer Software Division',
];

const VALIDITY_PRESETS = [
  { name: '1 year (365 days)', days: 365 },
  { name: '3 years (1095 days)', days: 1095 },
  { name: '5 years (1825 days)', days: 1825 },
  { name: '10 years (3650 days) — default', days: 3650 },
];

function log(message, type = 'info') {
  const colors = {
    info: chalk.blue,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
  };
  console.log(colors[type](message));
}

function error(message) {
  log(message, 'error');
  process.exit(1);
}

function success(message) {
  log(message, 'success');
}

function checkOpenSSL() {
  const r = spawnSync('openssl', ['version'], { encoding: 'utf8' });
  if (r.status !== 0) {
    return false;
  }
  return true;
}

/** Escape OpenSSL -subj DN value (commas and backslashes in values). */
function escapeDnValue(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/,/g, '\\,');
}

function buildSubject({ cn, ou, email }) {
  const parts = [
    `/C=${escapeDnValue(FIXED.C)}`,
    `/ST=${escapeDnValue(FIXED.ST)}`,
    `/L=${escapeDnValue(FIXED.L)}`,
    `/O=${escapeDnValue(FIXED.O)}`,
    `/OU=${escapeDnValue(ou)}`,
    `/CN=${escapeDnValue(cn)}`,
    `/emailAddress=${escapeDnValue(email)}`,
  ];
  return parts.join('');
}

function normalizeEmail(input) {
  const trimmed = String(input).trim();
  if (!trimmed) return { ok: false, message: 'Email cannot be empty' };
  const lower = trimmed.toLowerCase();
  const suffix = DOMAIN.toLowerCase();
  let full;
  if (trimmed.includes('@')) {
    if (!lower.endsWith(suffix)) {
      return { ok: false, message: `Email must end with ${DOMAIN}` };
    }
    full = trimmed;
  } else {
    if (!/^[a-zA-Z0-9._+-]+$/.test(trimmed)) {
      return { ok: false, message: 'Local part contains invalid characters' };
    }
    full = `${trimmed}${DOMAIN}`;
  }
  return { ok: true, email: full };
}

function sanitizeBaseFileName(cn) {
  const compact = String(cn).replace(/\s+/g, '');
  const safe = compact.replace(/[^a-zA-Z0-9._-]/g, '') || 'certificate';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${safe}-${stamp}`;
}

function runOpenSSL(args, options = {}) {
  const r = spawnSync('openssl', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim() || `exit ${r.status}`;
    throw new Error(err);
  }
  return r;
}

function exportPkcs12(keyPath, certPath, p12Path, password) {
  if (password === DEFAULT_P12_PASSWORD) {
    runOpenSSL([
      'pkcs12',
      '-export',
      '-out',
      p12Path,
      '-inkey',
      keyPath,
      '-in',
      certPath,
      '-passout',
      `pass:${DEFAULT_P12_PASSWORD}`,
      '-name',
      'asti-cert',
    ]);
    return;
  }

  const tmp = path.join(os.tmpdir(), `asti-cert-${process.pid}-${Date.now()}.pwd`);
  try {
    fs.writeFileSync(tmp, password, { mode: 0o600 });
    runOpenSSL([
      'pkcs12',
      '-export',
      '-out',
      p12Path,
      '-inkey',
      keyPath,
      '-in',
      certPath,
      '-passout',
      `file:${tmp}`,
      '-name',
      'asti-cert',
    ]);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (e) {
      /* ignore */
    }
  }
}

function showVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    log(`asti-cert v${pkg.version}`, 'info');
  } catch (e) {
    log('asti-cert (version unknown)', 'info');
  }
}

function showHelp() {
  log('\nUsage: asti-cert [options]', 'info');
  log('\nOptions:', 'info');
  log('  -v, --version             Show version number', 'info');
  log('  -h, --help                Show this help message', 'info');
  log('\nDescription:', 'info');
  log('  Interactive tool to create a self-signed DOST-ASTI certificate', 'info');
  log('  (private key, CSR, .cer, .p12) using OpenSSL.', 'info');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  if (args.includes('--version') || args.includes('-v')) {
    showVersion();
    process.exit(0);
  }

  if (!checkOpenSSL()) {
    error('OpenSSL is not installed or not in PATH. Install OpenSSL and try again.');
  }

  log('\n=== asti-cert (DOST-ASTI self-signed certificate) ===\n', 'info');
  log('This tool creates a self-signed certificate for local use (e.g. signing workflows).', 'warning');
  log('Confirm with HR/IT that a self-signed .p12 meets your organization\'s requirements.', 'warning');
  log('The file you usually import is the .p12 bundle.\n', 'info');

  const { fullName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'fullName',
      message: 'Full name (certificate CN):',
      validate: (input) => {
        if (!String(input).trim()) return 'Full name is required';
        return true;
      },
    },
  ]);

  const { department } = await inquirer.prompt([
    {
      type: 'list',
      name: 'department',
      message: 'Department / division:',
      choices: DEPARTMENTS,
    },
  ]);

  const { emailInput } = await inquirer.prompt([
    {
      type: 'input',
      name: 'emailInput',
      message: `Email (full address or local part before ${DOMAIN}):`,
      validate: (input) => {
        const n = normalizeEmail(input);
        return n.ok ? true : n.message;
      },
    },
  ]);

  const { email } = normalizeEmail(emailInput);

  const { validityChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'validityChoice',
      message: 'Certificate validity:',
      choices: [
        ...VALIDITY_PRESETS.map((p) => ({ name: p.name, value: p.days })),
        { name: 'Custom (enter days)', value: 'custom' },
      ],
      default: 3650,
    },
  ]);

  let validityDays = validityChoice;
  if (validityChoice === 'custom') {
    const { days } = await inquirer.prompt([
      {
        type: 'input',
        name: 'days',
        message: 'Validity in days:',
        validate: (input) => {
          const n = parseInt(String(input).trim(), 10);
          if (Number.isNaN(n) || n < 1 || n > 36500) {
            return 'Enter a number between 1 and 36500';
          }
          return true;
        },
      },
    ]);
    validityDays = parseInt(String(days).trim(), 10);
  }

  const { outDir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outDir',
      message: 'Output directory:',
      default: path.join(process.cwd(), 'digital_cert'),
    },
  ]);

  const resolvedOut = path.resolve(String(outDir).trim() || path.join(process.cwd(), 'digital_cert'));

  const { useDefaultPassword } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useDefaultPassword',
      message: `Use default .p12 password "${DEFAULT_P12_PASSWORD}" (same as legacy onboarding)?`,
      default: true,
    },
  ]);

  let p12Password = DEFAULT_P12_PASSWORD;
  if (!useDefaultPassword) {
    const pw = await inquirer.prompt([
      {
        type: 'password',
        name: 'p1',
        message: 'Choose a PKCS#12 password:',
        mask: '*',
        validate: (input) => {
          if (!input || String(input).length < MIN_CUSTOM_PASSWORD_LENGTH) {
            return `Password must be at least ${MIN_CUSTOM_PASSWORD_LENGTH} characters`;
          }
          return true;
        },
      },
      {
        type: 'password',
        name: 'p2',
        message: 'Confirm PKCS#12 password:',
        mask: '*',
      },
    ]);
    if (pw.p1 !== pw.p2) {
      error('Passwords do not match.');
    }
    p12Password = pw.p1;
  }

  const baseName = sanitizeBaseFileName(fullName.trim());
  const subject = buildSubject({ cn: fullName.trim(), ou: department, email });

  log('\n--- Summary ---', 'info');
  log(`Subject: ${subject}`, 'info');
  log(`Validity: ${validityDays} days`, 'info');
  log(`Output directory: ${resolvedOut}`, 'info');
  log(`Files: ${baseName}.pkey, ${baseName}.csr, ${baseName}.cer, ${baseName}.p12`, 'info');

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Create certificate files now?',
      default: true,
    },
  ]);

  if (!proceed) {
    log('Cancelled.', 'info');
    process.exit(0);
  }

  if (!fs.existsSync(resolvedOut)) {
    fs.mkdirSync(resolvedOut, { recursive: true });
  }

  const keyPath = path.join(resolvedOut, `${baseName}.pkey`);
  const csrPath = path.join(resolvedOut, `${baseName}.csr`);
  const cerPath = path.join(resolvedOut, `${baseName}.cer`);
  const p12Path = path.join(resolvedOut, `${baseName}.p12`);

  try {
    runOpenSSL(['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', keyPath]);
    success(`✓ Private key written: ${keyPath}`);

    runOpenSSL(['req', '-new', '-sha256', '-key', keyPath, '-out', csrPath, '-subj', subject]);
    success(`✓ CSR written: ${csrPath}`);

    runOpenSSL([
      'x509',
      '-req',
      '-days',
      String(validityDays),
      '-in',
      csrPath,
      '-signkey',
      keyPath,
      '-out',
      cerPath,
    ]);
    success(`✓ Certificate written: ${cerPath}`);

    exportPkcs12(keyPath, cerPath, p12Path, p12Password);
    success(`✓ PKCS#12 written: ${p12Path}`);
  } catch (e) {
    error(`OpenSSL failed: ${e.message}`);
  }

  log('\n=== Done ===\n', 'success');
  log('Files created:', 'info');
  log(`  Private key:  ${keyPath}`, 'info');
  log(`  CSR:          ${csrPath}`, 'info');
  log(`  Certificate:  ${cerPath}`, 'info');
  log(`  ${chalk.green.bold('Import this for signing:')} ${p12Path}`, 'success');

  if (useDefaultPassword) {
    log(`\nYour .p12 was created with the default password: ${chalk.bold(DEFAULT_P12_PASSWORD)}`, 'warning');
    log('Back up your digital certificate; you can change or personalize the password after import in your OS or PDF tool.', 'info');
  } else {
    log('\nYour .p12 was created with the custom password you entered (not shown again). Store it safely.', 'warning');
  }

  log('\nKeep your private key and .p12 confidential. Do not commit them to git.', 'warning');
}

main().catch((err) => {
  error(err.message || String(err));
});
