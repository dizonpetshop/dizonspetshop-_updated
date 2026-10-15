<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../public/db.php';

const REGISTRATION_OTP_LIFETIME = 600;
const REGISTRATION_OTP_RESEND_DELAY = 60;
const REGISTRATION_OTP_MAX_ATTEMPTS = 5;

function formatFullName(string $firstName, ?string $middleInitial, string $surname): string
{
    $middle = $middleInitial ? ' ' . rtrim($middleInitial, '.') . '.' : '';
    return trim($firstName . $middle . ' ' . $surname);
}

function isValidPersonName(string $value): bool
{
    return (bool) preg_match("/^[\\p{L}][\\p{L} .'-]{0,99}$/u", $value);
}

function isValidPhoneNumber(string $value): bool
{
    if (!preg_match('/^\+?[0-9\s().-]+$/', $value)) {
        return false;
    }

    $digits = preg_replace('/\D+/', '', $value);
    return strlen($digits) >= 10 && strlen($digits) <= 15;
}

function sendRegistrationOtp(string $email, string $displayName, string $code): bool
{
    $safeDisplayName = htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8');
    $safeCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
    $message = '<!doctype html>
        <html lang="en">
        <body style="margin:0;padding:0;background:#eaf3ff;font-family:Arial,sans-serif;color:#10214d;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eaf3ff;padding:32px 12px;">
                <tr><td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 35px rgba(16,33,77,.14);">
                        <tr><td style="padding:28px;text-align:center;background:linear-gradient(135deg,#10214d,#2f6edf);color:#ffffff;">
                            <div style="font-size:28px;">&#128062;</div>
                            <h1 style="margin:8px 0 0;font-size:24px;">Verify your email</h1>
                            <p style="margin:8px 0 0;color:#dbe7ff;font-size:14px;">Dizon\'s Petshop Grooming</p>
                        </td></tr>
                        <tr><td style="padding:32px;text-align:center;">
                            <p style="margin:0 0 10px;font-size:16px;">Hello <strong>' . $safeDisplayName . '</strong>,</p>
                            <p style="margin:0 0 24px;color:#53627c;line-height:1.6;">Enter this verification code to confirm your email and create your account.</p>
                            <div style="display:inline-block;padding:17px 24px;border:2px dashed #2f6edf;border-radius:14px;background:#f3f8ff;color:#10214d;font-size:32px;font-weight:800;letter-spacing:8px;">' . $safeCode . '</div>
                            <p style="margin:24px 0 0;color:#53627c;font-size:13px;">This code expires in <strong>10 minutes</strong>.</p>
                        </td></tr>
                        <tr><td style="padding:18px 28px;background:#f6f9ff;text-align:center;color:#7a879c;font-size:12px;line-height:1.5;">
                            If you did not request this account, you can safely ignore this email.<br>This is an automated message; please do not reply.
                        </td></tr>
                    </table>
                </td></tr>
            </table>
        </body>
        </html>';

    return sendMail($email, 'Verify Your Dizon Pet Shop Account', $message, true);
}

function sendAccountVerifiedEmail(string $email, string $displayName): bool
{
    $safeDisplayName = htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8');
    $loginUrl = htmlspecialchars(buildUrl('login.php'), ENT_QUOTES, 'UTF-8');
    $message = '<!doctype html>
        <html lang="en">
        <body style="margin:0;padding:0;background:#eaf3ff;font-family:Arial,sans-serif;color:#10214d;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eaf3ff;padding:32px 12px;">
                <tr><td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 35px rgba(16,33,77,.14);">
                        <tr><td style="padding:32px;text-align:center;background:linear-gradient(135deg,#10214d,#2f6edf);color:#ffffff;">
                            <div style="display:inline-block;width:58px;height:58px;line-height:58px;border-radius:50%;background:#29b6f0;font-size:30px;font-weight:bold;">&#10003;</div>
                            <h1 style="margin:14px 0 0;font-size:24px;">Account verified!</h1>
                        </td></tr>
                        <tr><td style="padding:32px;text-align:center;">
                            <p style="margin:0 0 12px;font-size:16px;">Welcome, <strong>' . $safeDisplayName . '</strong>!</p>
                            <p style="margin:0 0 26px;color:#53627c;line-height:1.6;">Your email has been verified and your Dizon\'s Petshop Grooming account is ready.</p>
                            <a href="' . $loginUrl . '" style="display:inline-block;padding:13px 28px;border-radius:999px;background:#2f6edf;color:#ffffff;text-decoration:none;font-weight:bold;">Log in to your account</a>
                        </td></tr>
                        <tr><td style="padding:18px 28px;background:#f6f9ff;text-align:center;color:#7a879c;font-size:12px;">
                            Thank you for joining Dizon\'s Petshop Grooming.
                        </td></tr>
                    </table>
                </td></tr>
            </table>
        </body>
        </html>';

    return sendMail($email, 'Your Dizon Pet Shop Account Is Verified', $message, true);
}

function emailExists(PDO $pdo, string $email): bool
{
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    return (bool) $stmt->fetchColumn();
}

function getPendingRegistration(PDO $pdo): ?array
{
    $pendingId = filter_var($_SESSION['pending_registration_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$pendingId) {
        return null;
    }

    $stmt = $pdo->prepare('SELECT * FROM pending_registrations WHERE id = ? LIMIT 1');
    $stmt->execute([$pendingId]);
    $pending = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$pending) {
        unset($_SESSION['pending_registration_id']);
        return null;
    }

    return $pending;
}

function issueRegistrationOtp(
    PDO $pdo,
    string $surname,
    string $firstName,
    ?string $middleInitial,
    string $phoneNumber,
    string $email,
    string $passwordHash,
    ?int $pendingId = null
): bool {
    $code = generateVerificationCode(6);
    $displayName = formatFullName($firstName, $middleInitial, $surname);

    if (!sendRegistrationOtp($email, $displayName, $code)) {
        return false;
    }

    $otpHash = password_hash($code, PASSWORD_DEFAULT);
    $expiresAt = gmdate('Y-m-d H:i:s', time() + REGISTRATION_OTP_LIFETIME);
    $sentAt = gmdate('Y-m-d H:i:s');

    try {
        if ($pendingId !== null) {
            $stmt = $pdo->prepare(
                'UPDATE pending_registrations
                 SET otp_hash = ?, otp_expires_at = ?, last_sent_at = ?, attempts = 0
                 WHERE id = ?'
            );
            $stmt->execute([$otpHash, $expiresAt, $sentAt, $pendingId]);
            return $stmt->rowCount() > 0;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO pending_registrations
                (surname, first_name, middle_initial, phone_number, email, password_hash, otp_hash, otp_expires_at, last_sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $surname,
            $firstName,
            $middleInitial,
            $phoneNumber,
            $email,
            $passwordHash,
            $otpHash,
            $expiresAt,
            $sentAt,
        ]);
        $_SESSION['pending_registration_id'] = (int) $pdo->lastInsertId();
    } catch (PDOException $exception) {
        error_log('Unable to store registration OTP: ' . $exception->getMessage());
        return false;
    }

    return true;
}

$error = '';
$success = '';
unset($_SESSION['pending_registration']); // Remove data created by the former session-only OTP flow.
$pdo->exec("DELETE FROM pending_registrations WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
$pendingRegistration = getPendingRegistration($pdo);
$step = $pendingRegistration ? 2 : 1;
$surnameValue = $pendingRegistration['surname'] ?? '';
$firstNameValue = $pendingRegistration['first_name'] ?? '';
$middleInitialValue = $pendingRegistration['middle_initial'] ?? '';
$phoneNumberValue = $pendingRegistration['phone_number'] ?? '';
$emailValue = $pendingRegistration['email'] ?? '';
$_SESSION['registration_csrf'] ??= generateToken();
$csrfToken = $_SESSION['registration_csrf'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedCsrf = $_POST['csrf_token'] ?? '';

    if (!is_string($submittedCsrf) || !hash_equals($csrfToken, $submittedCsrf)) {
        $error = 'Your form session is invalid or expired. Please refresh the page and try again.';
    } else {
        $action = $_POST['action'] ?? '';

        if ($action === 'request_otp') {
        $surnameValue = trim($_POST['surname'] ?? '');
        $firstNameValue = trim($_POST['first_name'] ?? '');
        $middleInitialValue = strtoupper(rtrim(trim($_POST['middle_initial'] ?? ''), '.'));
        $phoneNumberValue = trim($_POST['phone_number'] ?? '');
        $emailValue = strtolower(trim($_POST['email'] ?? ''));
        $password = $_POST['password'] ?? '';
        $confirmPassword = $_POST['confirm_password'] ?? '';

        if ($surnameValue === '' || $firstNameValue === '' || $phoneNumberValue === '' || $emailValue === '' || $password === '' || $confirmPassword === '') {
            $error = 'Please fill in all required fields.';
        } elseif (!isValidPersonName($surnameValue) || !isValidPersonName($firstNameValue)) {
            $error = 'First name and surname may contain only letters, spaces, apostrophes, periods, and hyphens.';
        } elseif ($middleInitialValue !== '' && !preg_match('/^\p{L}$/u', $middleInitialValue)) {
            $error = 'Middle initial must be one letter.';
        } elseif (!isValidPhoneNumber($phoneNumberValue)) {
            $error = 'Enter a valid contact number containing 10 to 15 digits.';
        } elseif (!filter_var($emailValue, FILTER_VALIDATE_EMAIL)) {
            $error = 'Please enter a valid email address.';
        } elseif ($password !== $confirmPassword) {
            $error = 'Passwords do not match.';
        } elseif (!isPasswordStrong($password)) {
            $error = 'Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.';
        } elseif (emailExists($pdo, $emailValue)) {
            $error = 'Email is already registered.';
        } elseif (issueRegistrationOtp(
            $pdo,
            $surnameValue,
            $firstNameValue,
            $middleInitialValue !== '' ? $middleInitialValue : null,
            $phoneNumberValue,
            $emailValue,
            password_hash($password, PASSWORD_DEFAULT)
        )) {
            $step = 2;
            $success = 'A six-digit verification code was sent to ' . htmlspecialchars($emailValue, ENT_QUOTES, 'UTF-8') . '.';
        } else {
            unset($_SESSION['pending_registration_id']);
            $error = 'We could not send the verification email. Please try again later.';
        }
        } elseif ($action === 'verify_otp') {
        $pendingRegistration = getPendingRegistration($pdo);
        $enteredCode = trim($_POST['otp'] ?? '');
        $step = 2;

        if (!$pendingRegistration) {
            $recentlyCompleted = isset($_SESSION['registration_completed_at'])
                && time() - (int) $_SESSION['registration_completed_at'] < 120;

            if ($recentlyCompleted) {
                $_SESSION['login_success'] = 'Account successfully created and verified. Please log in.';
                header('Location: login.php');
                exit;
            }

            $step = 1;
            $error = 'Your registration session has expired. Please enter your details again.';
        } elseif (!preg_match('/^\d{6}$/', $enteredCode)) {
            $error = 'Enter the six-digit verification code.';
        } elseif (time() > databaseTimestamp($pendingRegistration['otp_expires_at'])) {
            $error = 'The verification code has expired. Please request a new code.';
        } elseif ($pendingRegistration['attempts'] >= REGISTRATION_OTP_MAX_ATTEMPTS) {
            $error = 'Too many incorrect attempts. Please request a new code.';
        } elseif (!password_verify($enteredCode, $pendingRegistration['otp_hash'])) {
            $newAttempts = (int) $pendingRegistration['attempts'] + 1;
            $update = $pdo->prepare('UPDATE pending_registrations SET attempts = ? WHERE id = ?');
            $update->execute([$newAttempts, $pendingRegistration['id']]);
            $remaining = REGISTRATION_OTP_MAX_ATTEMPTS - $newAttempts;
            $error = $remaining > 0
                ? 'Incorrect verification code. ' . $remaining . ' attempt' . ($remaining === 1 ? '' : 's') . ' remaining.'
                : 'Too many incorrect attempts. Please request a new code.';
        } elseif (emailExists($pdo, $pendingRegistration['email'])) {
            $delete = $pdo->prepare('DELETE FROM pending_registrations WHERE id = ?');
            $delete->execute([$pendingRegistration['id']]);
            unset($_SESSION['pending_registration_id']);
            $step = 1;
            $error = 'Email is already registered. Please use a different email.';
        } else {
            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare(
                    'INSERT INTO users
                        (surname, first_name, middle_initial, phone_number, email, email_verified_at, password, role, account_status)
                     VALUES (?, ?, ?, ?, ?, NOW(), ?, \'User\', \'Active\')'
                );
                $stmt->execute([
                    $pendingRegistration['surname'],
                    $pendingRegistration['first_name'],
                    $pendingRegistration['middle_initial'],
                    $pendingRegistration['phone_number'],
                    $pendingRegistration['email'],
                    $pendingRegistration['password_hash'],
                ]);
                $profileLookup = $pdo->prepare('SELECT id FROM customers WHERE email = ? LIMIT 1');
                $profileLookup->execute([$pendingRegistration['email']]);
                if (!$profileLookup->fetchColumn()) {
                    $profileInsert = $pdo->prepare('INSERT INTO customers (customer_name, email, phone) VALUES (?, ?, ?)');
                    $profileInsert->execute([
                        formatFullName($pendingRegistration['first_name'], $pendingRegistration['middle_initial'], $pendingRegistration['surname']),
                        $pendingRegistration['email'],
                        $pendingRegistration['phone_number'],
                    ]);
                }
                $delete = $pdo->prepare('DELETE FROM pending_registrations WHERE id = ?');
                $delete->execute([$pendingRegistration['id']]);
                $pdo->commit();

                unset($_SESSION['pending_registration_id']);
                $_SESSION['registration_completed_at'] = time();
                $confirmationSent = sendAccountVerifiedEmail(
                    $pendingRegistration['email'],
                    formatFullName(
                        $pendingRegistration['first_name'],
                        $pendingRegistration['middle_initial'],
                        $pendingRegistration['surname']
                    )
                );
                $_SESSION['login_success'] = $confirmationSent
                    ? 'Account successfully created and verified. A confirmation email was sent to you. Please log in.'
                    : 'Account successfully created and verified. Please log in.';
                header('Location: login.php');
                exit;
            } catch (PDOException $exception) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('Unable to complete verified registration: ' . $exception->getMessage());
                $error = (string) $exception->getCode() === '23000'
                    ? 'Email is already registered. Please use a different email.'
                    : 'We could not create your account. Please try again.';
            }
        }
        } elseif ($action === 'resend_otp') {
        $pendingRegistration = getPendingRegistration($pdo);
        $step = 2;

        if (!$pendingRegistration) {
            $step = 1;
            $error = 'Your registration session has expired. Please enter your details again.';
        } else {
            $secondsSinceLastSend = time() - databaseTimestamp($pendingRegistration['last_sent_at']);
            if ($secondsSinceLastSend < REGISTRATION_OTP_RESEND_DELAY) {
                $wait = REGISTRATION_OTP_RESEND_DELAY - $secondsSinceLastSend;
                $error = 'Please wait ' . $wait . ' seconds before requesting another code.';
            } elseif (issueRegistrationOtp(
                $pdo,
                $pendingRegistration['surname'],
                $pendingRegistration['first_name'],
                $pendingRegistration['middle_initial'],
                $pendingRegistration['phone_number'],
                $pendingRegistration['email'],
                $pendingRegistration['password_hash'],
                (int) $pendingRegistration['id']
            )) {
                $success = 'A new verification code was sent to ' . htmlspecialchars($pendingRegistration['email'], ENT_QUOTES, 'UTF-8') . '.';
            } else {
                $error = 'We could not resend the verification email. Please try again later.';
            }
        }
        } elseif ($action === 'restart_registration') {
            $pendingRegistration = getPendingRegistration($pdo);
            if ($pendingRegistration) {
                $delete = $pdo->prepare('DELETE FROM pending_registrations WHERE id = ?');
                $delete->execute([$pendingRegistration['id']]);
            }
            unset($_SESSION['pending_registration_id']);
            $step = 1;
            $surnameValue = '';
            $firstNameValue = '';
            $middleInitialValue = '';
            $phoneNumberValue = '';
            $emailValue = '';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign Up - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:ital,wght@0,700;0,800;1,600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="auth-bg register-page">

<div class="auth-shell">
    <div class="auth-card">
        <div class="auth-card-header">
            <span class="register-eyebrow"><i class="fa-solid fa-paw"></i> Dizon's Petshop Grooming</span>
            <h1 class="auth-card-title">Register Account</h1>
            <p class="auth-card-subtitle">
                <?= $step === 1 ? 'Create your account with a verified email' : 'Check your inbox and verify your email' ?>
            </p>
            <div class="register-stepper" aria-label="Registration progress">
                <span class="register-step <?= $step === 1 ? 'active' : 'complete' ?>"><b><?= $step === 1 ? '1' : '<i class="fa-solid fa-check"></i>' ?></b> Your details</span>
                <span class="register-step-line <?= $step === 2 ? 'complete' : '' ?>"></span>
                <span class="register-step <?= $step === 2 ? 'active' : '' ?>"><b>2</b> Email verification</span>
            </div>
        </div>

        <?php if (!empty($error)): ?>
            <div class="alert alert-danger py-2 text-center" style="font-size: 0.85rem; border-radius: 15px;"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <?php if (!empty($success)): ?>
            <div class="alert alert-success py-2 text-center" style="font-size: 0.85rem; border-radius: 15px;"><?= $success ?></div>
        <?php endif; ?>

        <div class="auth-card-body">
            <div class="auth-card-brand">
                <div class="register-brand-content">
                    <div class="register-logo-wrap">
                        <img src="../images/cutoutlogo.png" alt="Dizon's Pet Grooming">
                    </div>
                    <span class="register-brand-kicker">Welcome to the family</span>
                    <h2>Better care starts with a trusted account.</h2>
                    <p>Book grooming services, manage your pet details, and shop essentials in one secure place.</p>
                    <ul>
                        <li><i class="fa-solid fa-shield-heart"></i> Secure email verification</li>
                        <li><i class="fa-solid fa-calendar-check"></i> Easy appointment management</li>
                        <li><i class="fa-solid fa-bag-shopping"></i> Pet essentials within reach</li>
                    </ul>
                </div>
            </div>

            <div class="auth-card-form">
                <?php if ($step === 1): ?>
                <form action="register.php" method="POST" id="registerForm">
                    <input type="hidden" name="action" value="request_otp">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
                    <div class="register-form-heading">
                        <span>Personal information</span>
                        <p>Use your legal name and an active contact number.</p>
                    </div>
                    <div class="row g-2">
                        <div class="col-md-6 mb-2">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">SURNAME</label>
                            <input type="text" name="surname" class="form-control" value="<?= htmlspecialchars($surnameValue, ENT_QUOTES, 'UTF-8') ?>" autocomplete="family-name" maxlength="100" required>
                        </div>
                        <div class="col-md-6 mb-2">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">FIRST NAME</label>
                            <input type="text" name="first_name" class="form-control" value="<?= htmlspecialchars($firstNameValue, ENT_QUOTES, 'UTF-8') ?>" autocomplete="given-name" maxlength="100" required>
                        </div>
                    </div>
                    <div class="row g-2">
                        <div class="col-4 mb-2">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">M.I.</label>
                            <input type="text" name="middle_initial" class="form-control text-uppercase" value="<?= htmlspecialchars($middleInitialValue, ENT_QUOTES, 'UTF-8') ?>" autocomplete="additional-name" maxlength="2" placeholder="A">
                        </div>
                        <div class="col-8 mb-2">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">CONTACT NUMBER</label>
                            <input type="tel" name="phone_number" class="form-control" value="<?= htmlspecialchars($phoneNumberValue, ENT_QUOTES, 'UTF-8') ?>" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="09XXXXXXXXX" required>
                        </div>
                    </div>
                    <div class="mb-2">
                        <label class="form-label fw-bold" style="font-size: 0.8rem;">EMAIL</label>
                        <input type="email" name="email" class="form-control" value="<?= htmlspecialchars($emailValue, ENT_QUOTES, 'UTF-8') ?>" autocomplete="email" required>
                    </div>
                    <div class="mb-2">
                        <label class="form-label fw-bold" style="font-size: 0.8rem;">PASSWORD</label>
                        <div class="password-field">
                            <input type="password" name="password" id="password" class="form-control" autocomplete="new-password" required>
                            <button type="button" class="password-toggle" data-target="password" aria-label="Show password">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                        <ul class="requirement-list px-2" id="passwordCriteria">
                            <li id="length" class="invalid">✘ At least 8 characters long</li>
                            <li id="uppercase" class="invalid">✘ Uppercase and lowercase letters</li>
                            <li id="number" class="invalid">✘ At least one number</li>
                            <li id="special" class="invalid">✘ At least one special character (e.g., @, !, #)</li>
                        </ul>
                    </div>
                    <div class="mb-2">
                        <label class="form-label fw-bold" style="font-size: 0.8rem;">CONFIRM PASSWORD</label>
                        <div class="password-field">
                            <input type="password" name="confirm_password" id="confirmPassword" class="form-control" autocomplete="new-password" required>
                            <button type="button" class="password-toggle" data-target="confirmPassword" aria-label="Show password">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </div>
                </form>
                <?php else: ?>
                <form action="register.php" method="POST" id="verifyForm">
                    <input type="hidden" name="action" value="verify_otp">
                    <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
                    <div class="email-verification-panel">
                        <span class="email-verification-icon"><i class="fa-solid fa-envelope-circle-check"></i></span>
                        <h2>Check your email</h2>
                        <p>We sent a six-digit verification code to</p>
                        <strong><?= htmlspecialchars($emailValue, ENT_QUOTES, 'UTF-8') ?></strong>
                        <small>The code expires in 10 minutes.</small>
                    </div>
                    <div class="mb-3">
                        <label for="registrationOtp" class="form-label fw-bold" style="font-size: 0.8rem;">6-DIGIT VERIFICATION CODE</label>
                        <input type="text" name="otp" id="registrationOtp" class="form-control text-center fw-bold registration-otp-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="------" required autofocus>
                    </div>
                </form>
                <?php endif; ?>
            </div>
        </div>

        <div class="auth-card-footer">
            <?php if ($step === 1): ?>
            <a href="login.php" class="auth-footer-btn"><i class="fa-solid fa-arrow-left"></i> Back to Login</a>
            <button type="submit" form="registerForm" class="auth-footer-btn auth-footer-btn--accent">Verify Email <i class="fa-solid fa-arrow-right"></i></button>
            <?php else: ?>
            <form action="register.php" method="POST" class="auth-footer-form">
                <input type="hidden" name="action" value="restart_registration">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
                <button type="submit" class="auth-footer-btn">Change Email</button>
            </form>
            <form action="register.php" method="POST" class="auth-footer-form">
                <input type="hidden" name="action" value="resend_otp">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
                <button type="submit" class="auth-footer-btn">Resend Code</button>
            </form>
            <button type="submit" form="verifyForm" class="auth-footer-btn auth-footer-btn--accent">Verify &amp; Register</button>
            <?php endif; ?>
        </div>
    </div>
</div>

<script src="../js/password-validation.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
    ['registerForm', 'verifyForm'].forEach(function(formId) {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', function() {
            const submitButton = document.querySelector('[form="' + formId + '"]');
            if (!submitButton || submitButton.disabled) return;

            submitButton.disabled = true;
            submitButton.innerHTML = formId === 'verifyForm'
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Verifying account...'
                : '<i class="fa-solid fa-spinner fa-spin"></i> Sending verification...';
        });
    });

    document.querySelectorAll('.password-toggle').forEach(function(button) {
        button.addEventListener('click', function() {
            const target = document.getElementById(this.dataset.target);
            const icon = this.querySelector('i');

            if (!target) return;

            if (target.type === 'password') {
                target.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                this.setAttribute('aria-label', 'Hide password');
            } else {
                target.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                this.setAttribute('aria-label', 'Show password');
            }
        });
    });
</script>
</body>
</html>
