SMTP / PHPMailer setup for petshop

Overview

The password reset flow in `auth/forgot_password.php` can send verification codes via SMTP using PHPMailer. By default SMTP is disabled and the code falls back to PHP `mail()` for local testing.

Recommended steps to enable real delivery

1. Install PHPMailer via Composer (recommended)

```bash
cd /xampp/htdocs/petshop
composer require phpmailer/phpmailer
```

2. Update `auth/forgot_password.php` SMTP settings

Open `auth/forgot_password.php` and change the `$smtp_config` array near the top:

- Set `'enabled' => true`
- Set `'username'` to your SMTP username (for Gmail this is your full email)
- Set `'password'` to an app password (Gmail + 2FA) or SMTP password
- Adjust `host`, `port`, and `secure` if needed
- Optionally change `from_email` and `from_name`

Example configuration for Gmail (use App Password):

```php
$smtp_config = [
  'enabled'    => true,
  'host'       => 'smtp.gmail.com',
  'port'       => 587,
  'username'   => 'your@gmail.com',
  'password'   => 'your-app-password',
  'secure'     => 'tls',
  'from_email' => 'no-reply@dizonspetshop.com',
  'from_name'  => 'Fur Friends',
];
```

3. Use a testing SMTP service (recommended for development)

- Mailtrap (mailtrap.io): captures emails for testing. Use the SMTP credentials they provide.
- smtp4dev or MailHog (local SMTP server) — run on your machine and point PHPMailer to it.

4. Windows / XAMPP php.ini notes (if you prefer PHP `mail()`)

- PHP `mail()` on Windows requires a working SMTP server; XAMPP does not provide one by default.
- Edit `php.ini` (look for `[mail function]`) to set `SMTP = smtp.example.com` and `smtp_port = 25` — but this often isn't sufficient for authenticated SMTP providers.

5. Troubleshooting

- If emails are not sent and PHPMailer throws errors, check `error_log()` entries or enable debugging in PHPMailer (set `$mail->SMTPDebug = 2;` temporarily).
- For Gmail, generate an App Password and use that (regular account password often fails if 2FA is enabled).
- For local testing, Mailtrap or MailHog are much easier than configuring system-level mail.

Quick test command (lint the PHP file):

```bash
php -l auth/forgot_password.php
```

Security notes

- Never commit real SMTP credentials to source control. Use environment variables or a local configuration file excluded from Git.

If you want, I can:
- enable SMTP in `auth/forgot_password.php` with placeholder env reads, or
- add a small `.env.example` and `.gitignore` for credentials, or
- run `composer require phpmailer/phpmailer` here (if you allow me to run terminal commands).