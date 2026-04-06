# asti-cert

Interactive CLI to create a **self-signed** DOST-ASTI digital certificate (private key, CSR, `.cer`, and **`.p12`**) using **OpenSSL** on your machine. Intended for workflows such as local signing where your organization accepts a self-signed PKCS#12 bundle.

## Install

### From npm (recommended)

**Linux (one-time setup if you get permission errors):**

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

Then:

```bash
npm install -g asti-cert
```

**macOS / Windows:**

```bash
npm install -g asti-cert
```

The global command is **`asti-cert`** (same as the package name).

### From source

```bash
git clone https://github.com/aikengunay/asti-cert.git
cd asti-cert
npm install
chmod +x cli.js
npm install -g .
```

## Requirements

- **Node.js** and **npm**
- **OpenSSL** on your `PATH` (included on most macOS/Linux setups; on Windows use Git for Windows or install OpenSSL separately)

## Privacy and security

- **Runs locally.** Certificate material is generated on **your machine** using **OpenSSL**. Output files go only to the folder you specify; nothing is uploaded to this project, the author, or a third-party service by the CLI itself.
- **No telemetry.** This tool does not send analytics, usage data, or your prompts (name, email, department, passwords) over the network.
- **Installing from npm** downloads the package from the npm registry the same way as any other global CLI; that process is separate from generating certificates and does not transmit your keys or answers to this package’s code paths.

Treat generated private keys and `.p12` files like any sensitive files: protect your device, use a strong password when you choose a custom one, and do not share or commit those artifacts.

## Usage

```bash
asti-cert
```

Follow the prompts for full name, department, email (`@asti.dost.gov.ph`), validity, output folder, and `.p12` password. The tool prints `Valid from … to …` with both dates highlighted in the terminal, then `(format: YYYY-MM-DD)`.

**Examples:**

```bash
asti-cert
asti-cert --version
asti-cert --help
```

## What it creates

In your chosen output folder (default: **`Downloads`** — e.g. `~/Downloads` on macOS/Linux, `%USERPROFILE%\Downloads` on Windows), the CLI writes **only a ZIP file** named with your name and a timestamp (e.g. `YourName-2026-04-06-143052.zip`). It does not create a separate `digital_cert` subfolder by default. Inside the archive are the four certificate files below; **extract the zip** before using them. Temporary loose files are removed after zipping. If your system uses a localized or custom Downloads location, type that full path at the prompt.

| File (inside the `.zip`) | Purpose |
|--------------------------|--------|
| `.pkey` | Private key (keep secret) |
| `.csr` | Certificate signing request |
| `.cer` | Self-signed certificate |
| **`.p12`** | **PKCS#12 bundle — this is what you usually import** for signing |

### Default `.p12` password

If you choose the **default** onboarding option, the PKCS#12 password is the literal word **`password`**, matching common internal onboarding text. After creation, the CLI prints this again so you can import immediately. **Back up** the zip (or the extracted `.p12`); you can change the password after import in your operating system or application.

If you choose a **custom** password, it is **not** printed again after success—store it safely.

After a successful run, the CLI prints the ASTI ERP link to upload your digital certificate (`https://erp.asti.dost.gov.ph/index.php?r=pmis/er/pki`). You must be logged in to ERP (otherwise you will see the login page first). In the UI the path is: ERP > Settings > Upload Digital Certificate.

## Fixed fields (DOST-ASTI v1)

- Country **PH**, state **National Capital Region**, locality **Quezon City**, organization **DOST-ASTI**
- Department: choose from the six fixed divisions in the interactive list
- Email must be **`…@asti.dost.gov.ph`** (you may enter the local part only or the full address)

## Important

- **Self-signed** certificates are not issued by a public CA. Whether HR, payroll, or other systems **accept** them is a **policy** question—confirm with your office before relying on them for official submissions.
- **Never** commit private keys or `.p12` files to git.

## Uninstall

```bash
npm uninstall -g asti-cert
```

## Publishing (maintainers)

Package name on npm: **`asti-cert`** (unscoped). Global command: **`asti-cert`**.

```bash
npm login
npm whoami
npm publish
# If 2FA is enabled:
npm publish --otp=<code>
```

If `npm publish` fails with **404** on `PUT`:

1. **Verify email** on [npmjs.com](https://www.npmjs.com/) account settings (unverified accounts often cannot publish).
2. **2FA:** pass `--otp` when your account requires it.
3. **Access tokens:** granular tokens must include **Publish** (not read-only).
4. **Name taken:** the unscoped name `asti-cert` must be available on your npm account (or you need a different name).

The CLI entrypoint is **`cli.js`** at the package root so npm’s packer keeps a valid `bin` link.

## License

MIT
