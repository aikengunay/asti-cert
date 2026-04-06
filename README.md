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

### From source

```bash
git clone https://github.com/aikengunay/asti-cert.git
cd asti-cert
npm install -g .
```

## Requirements

- **Node.js** and **npm**
- **OpenSSL** on your `PATH` (included on most macOS/Linux setups; on Windows use Git for Windows or install OpenSSL separately)

## Usage

```bash
asti-cert
```

Follow the prompts for full name, department, email (`@asti.dost.gov.ph`), validity, output folder, and `.p12` password.

**Examples:**

```bash
asti-cert
asti-cert --version
asti-cert --help
```

## What it creates

In your chosen output folder (default: `./digital_cert`), files are named with your name and a timestamp:

| File | Purpose |
|------|--------|
| `.pkey` | Private key (keep secret) |
| `.csr` | Certificate signing request |
| `.cer` | Self-signed certificate |
| **`.p12`** | **PKCS#12 bundle — this is what you usually import** for signing |

### Default `.p12` password

If you choose the **default** onboarding option, the PKCS#12 password is the literal word **`password`**, matching common internal onboarding text. After creation, the CLI prints this again so you can import immediately. **Back up** your `.p12`; you can change the password after import in your operating system or application.

If you choose a **custom** password, it is **not** printed again after success—store it safely.

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

## License

MIT
