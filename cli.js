#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const AdmZip = require('adm-zip');

const DOMAIN = '@asti.dost.gov.ph';
const ERP_PKI_UPLOAD_URL = 'https://erp.asti.dost.gov.ph/index.php?r=pmis/er/pki';
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

/** Format a Date as yyyy-mm-dd in local timezone. */
function formatYmdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayYmdLocal() {
  return formatYmdLocal(new Date());
}

/** Approximate not-after date (calendar) if the cert is issued today: today + days. */
function notAfterYmdFromDays(days) {
  const end = new Date();
  end.setDate(end.getDate() + Number(days));
  return formatYmdLocal(end);
}

/** Default save location: user's Downloads folder (zip is written here; no extra subfolder). */
function defaultOutputDirectory() {
  return path.join(os.homedir(), 'Downloads');
}

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

/** Pack .pkey, .csr, .cer, .p12 into one .zip, then delete the loose files (only the zip remains). */
function zipCertArtifactsAndRemoveLoose(paths, zipPath) {
  const zip = new AdmZip();
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      throw new Error(`Missing file before zip: ${p}`);
    }
    zip.addLocalFile(p, '', path.basename(p));
  }
  zip.writeZip(zipPath);
  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
    throw new Error('ZIP archive was not written correctly');
  }
  for (const p of paths) {
    fs.unlinkSync(p);
  }
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
    const pkgPath = path.join(__dirname, 'package.json');
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
      message: 'Department / division (↑/↓ then Enter):',
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

  // List `default` must be the choice index (not days). 3650 was out of range, so Enter wrongly picked 1 year.
  const validityChoices = [
    ...VALIDITY_PRESETS.map((p) => ({
      name: `${p.name} — not after ${notAfterYmdFromDays(p.days)} (yyyy-mm-dd)`,
      value: p.days,
    })),
    { name: 'Custom (enter days)', value: 'custom' },
  ];
  const defaultValidityIndex = VALIDITY_PRESETS.findIndex((p) => p.days === 3650);

  const { validityChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'validityChoice',
      message:
        'Certificate validity — not-after dates are calendar estimates in yyyy-mm-dd (local); default: 10 years (↑/↓, Enter):',
      choices: validityChoices,
      default: defaultValidityIndex >= 0 ? defaultValidityIndex : 0,
    },
  ]);

  let validityDays = validityChoice;
  if (validityChoice === 'custom') {
    const { days } = await inquirer.prompt([
      {
        type: 'input',
        name: 'days',
        message: 'Validity in days (1–36500); not-after will be shown as yyyy-mm-dd:',
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

  log(
    `  Validity window (estimate): valid from ${todayYmdLocal()} through ${notAfterYmdFromDays(validityDays)} (yyyy-mm-dd)`,
    'info'
  );

  const { outDir } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outDir',
      message: 'Output directory:',
      default: defaultOutputDirectory(),
    },
  ]);

  const resolvedOut = path.resolve(String(outDir).trim() || defaultOutputDirectory());

  const { useDefaultPassword } = await inquirer.prompt([
    {
      type: 'list',
      name: 'useDefaultPassword',
      message: 'PKCS#12 password (Press Enter to accept the highlighted option):',
      choices: [
        {
          name: `Use default password "${DEFAULT_P12_PASSWORD}" (legacy onboarding)`,
          value: true,
        },
        { name: 'Set a custom password', value: false },
      ],
      default: 0,
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
  log(
    `Validity: ${validityDays} days — not after ${notAfterYmdFromDays(validityDays)} (yyyy-mm-dd); valid from ${todayYmdLocal()} (yyyy-mm-dd)`,
    'info'
  );
  log(`Output directory: ${resolvedOut}`, 'info');
  log(
    `Files (will be bundled into ${baseName}.zip): ${baseName}.pkey, ${baseName}.csr, ${baseName}.cer, ${baseName}.p12`,
    'info'
  );

  const { proceed } = await inquirer.prompt([
    {
      type: 'list',
      name: 'proceed',
      message: 'Create certificate files now? (Press Enter to accept the highlighted option):',
      choices: [
        { name: 'Yes, create files', value: true },
        { name: 'No, cancel', value: false },
      ],
      default: 0,
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
  const zipPath = path.join(resolvedOut, `${baseName}.zip`);
  const loosePaths = [keyPath, csrPath, cerPath, p12Path];

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

    zipCertArtifactsAndRemoveLoose(loosePaths, zipPath);
    success(`✓ ZIP bundle created (loose files removed): ${zipPath}`);
  } catch (e) {
    error(e instanceof Error ? e.message : String(e));
  }

  log('\n=== Done ===\n', 'success');
  log('Your certificate bundle:', 'info');
  log(`  ${chalk.green.bold(zipPath)}`, 'success');
  log('  Extract the .zip when you need the files. Import the .p12 for signing (after extract).', 'info');

  log('\nUpload in ASTI ERP (open in your browser):', 'info');
  log(`  ${chalk.cyan(ERP_PKI_UPLOAD_URL)}`, 'info');
  log('  Sign in first if prompted; you cannot upload until you are logged in.', 'info');
  log('  In the app: ERP > Settings > Upload Digital Certificate', 'info');

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
