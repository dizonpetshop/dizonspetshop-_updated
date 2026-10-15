<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/../public/db.php';
$_SESSION['password_reset_csrf'] ??= bin2hex(random_bytes(32));
function sendPasswordResetCode(string $email, string $code): bool {
    return sendMail($email, 'Password Reset Verification Code', 'Your verification code is ' . $code . '. It expires in 20 minutes.', false);
}
$message = ''; $error = ''; $step = 1;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_POST['csrf_token'] ?? '';
    if (!is_string($csrf) || !hash_equals($_SESSION['password_reset_csrf'], $csrf)) {
        $error = 'Your recovery session expired. Please refresh and retry.';
    } elseif (isset($_POST['request_code'])) {
        $email = strtolower(trim($_POST['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $error = 'Enter a valid email address.';
        else {
            try {
                $pdo->beginTransaction();
                $lookup = $pdo->prepare('SELECT id,role,account_status,reset_token FROM users WHERE email=? FOR UPDATE');
                $lookup->execute([$email]); $user = $lookup->fetch(PDO::FETCH_ASSOC);
                if (!$user || $user['role'] !== 'User' || $user['account_status'] !== 'Active') {
                    $pdo->commit();
                    $message = 'If this email belongs to an active client account, a verification code will be sent.';
                } else {
                    $previous = explode(':', $user['reset_token'] ?? '', 4);
                    if (($previous[0] ?? '') === 'php-v1' && time() - (int) ($previous[1] ?? 0) < 60) throw new RuntimeException('Wait one minute before requesting a new code.');
                    $code = generateVerificationCode(6);
                    $digest = hash('sha256', $user['id'] . ':' . $email . ':' . $code);
                    $token = 'php-v1:' . time() . ':0:' . password_hash($digest, PASSWORD_DEFAULT);
                    $expires = gmdate('Y-m-d H:i:s', time() + 1200);
                    $pdo->prepare('UPDATE users SET reset_token=?,reset_expires=? WHERE id=?')->execute([$token,$expires,$user['id']]);
                    $pdo->commit();
                    if (sendPasswordResetCode($email, $code)) {
                        $_SESSION['reset_email'] = $email; $step = 2;
                        $message = 'Check your inbox for the verification code.';
                    } else {
                        $pdo->prepare('UPDATE users SET reset_token=NULL,reset_expires=NULL WHERE id=? AND reset_token=?')->execute([$user['id'],$token]);
                        $error = 'Email delivery is unavailable. Please contact the shop or try again later.';
                    }
                }
            } catch (Throwable $exception) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $error = $exception instanceof RuntimeException && !($exception instanceof PDOException) ? $exception->getMessage() : 'Recovery is temporarily unavailable.';
            }
        }
    } elseif (isset($_POST['verify_and_reset'])) {
        $step = 2;
        $email = $_SESSION['reset_email'] ?? '';
        $enteredCode = trim($_POST['verification_code'] ?? '');
        $password = $_POST['password'] ?? ''; $confirmation = $_POST['confirm_password'] ?? '';
        if (!preg_match('/^\d{6}$/', $enteredCode) || !isPasswordStrong($password) || $password !== $confirmation) $error = 'Enter the six-digit code and matching strong passwords (8-72 characters).';
        else {
            try {
                $pdo->beginTransaction();
                $lookup = $pdo->prepare('SELECT id,role,account_status,reset_token,reset_expires FROM users WHERE email=? FOR UPDATE');
                $lookup->execute([$email]); $user = $lookup->fetch(PDO::FETCH_ASSOC);
                $parsed = explode(':', $user['reset_token'] ?? '', 4);
                if (!$user || $user['role'] !== 'User' || $user['account_status'] !== 'Active' || count($parsed) !== 4 || $parsed[0] !== 'php-v1' || (int) $parsed[2] >= 5 || databaseTimestamp($user['reset_expires'] ?? '1970-01-01 00:00:00') <= time()) throw new RuntimeException('Invalid or expired verification code. Request a new code.');
                $digest = hash('sha256', $user['id'] . ':' . strtolower($email) . ':' . $enteredCode);
                if (!password_verify($digest, $parsed[3])) {
                    $attempts = (int) $parsed[2] + 1;
                    $next = $attempts >= 5 ? null : 'php-v1:' . $parsed[1] . ':' . $attempts . ':' . $parsed[3];
                    $pdo->prepare('UPDATE users SET reset_token=?,reset_expires=? WHERE id=?')->execute([$next,$next ? $user['reset_expires'] : null,$user['id']]);
                    $pdo->commit();
                    $error = $next ? 'Incorrect verification code.' : 'Too many attempts. Request a new code.';
                } else {
                    $pdo->prepare('UPDATE users SET password=?,reset_token=NULL,reset_expires=NULL,failed_attempts=0,lockout_time=NULL WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$user['id']]);
                    $pdo->commit(); unset($_SESSION['reset_email']); $step = 1;
                    $message = "Password updated. You can now <a href='login.php'>sign in</a>.";
                }
            } catch (Throwable $exception) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $error = $exception instanceof RuntimeException && !($exception instanceof PDOException) ? $exception->getMessage() : 'Recovery is temporarily unavailable.';
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forgot Password - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:ital,wght@0,700;0,800;1,600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="recovery-bg">

<div class="auth-shell">
    <div class="auth-card">
        <div class="auth-card-header">
            <h1 class="auth-card-title">Recovery</h1>
            <p class="auth-card-subtitle">
                <?= $step == 1 ? "Enter your email to receive a code" : "Enter verification code and new password" ?>
            </p>
        </div>

        <?php if (!empty($error)): ?>
            <div class="alert alert-danger py-2 text-center" style="font-size: 0.85rem; border-radius: 15px;"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <?php if (!empty($message)): ?>
            <?php if ($step == 2): ?>
                <div class="auth-alert-banner"><?= $message ?></div>
            <?php else: ?>
                <div class="alert alert-success py-2 text-center" style="font-size: 0.85rem; border-radius: 15px;"><?= $message ?></div>
            <?php endif; ?>
        <?php endif; ?>

        <div class="auth-card-body">
            <div class="auth-card-brand">
                <img src="../images/cutoutlogo.png" alt="Dizon's Pet Grooming">
            </div>

            <div class="auth-card-form">
                <?php if ($step == 1): ?>
                    <form action="forgot_password.php" method="POST" id="recoveryForm"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['password_reset_csrf']) ?>">
                        <div class="mb-3">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">EMAIL ADDRESS</label>
                            <input type="email" name="email" class="form-control" required>
                        </div>
                    </form>
                <?php else: ?>
                    <form action="forgot_password.php" method="POST" id="recoveryForm"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['password_reset_csrf']) ?>">
                        <div class="mb-2">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">6-DIGIT VERIFICATION CODE</label>
                            <input type="text" name="verification_code" class="form-control text-center fw-bold" maxlength="6" required placeholder="------">
                        </div>
                        <div class="mb-2">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">NEW PASSWORD</label>
                            <div class="password-field">
                                <input type="password" name="password" id="newPassword" class="form-control" required>
                                <button type="button" class="password-toggle" data-target="newPassword" aria-label="Show password">
                                    <i class="fa-solid fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="mb-2">
                            <label class="form-label fw-bold" style="font-size: 0.8rem;">CONFIRM NEW PASSWORD</label>
                            <div class="password-field">
                                <input type="password" name="confirm_password" id="confirmResetPassword" class="form-control" required>
                                <button type="button" class="password-toggle" data-target="confirmResetPassword" aria-label="Show password">
                                    <i class="fa-solid fa-eye"></i>
                                </button>
                            </div>
                        </div>
                    </form>
                <?php endif; ?>
            </div>
        </div>

        <div class="auth-card-footer">
            <?php if ($step == 1): ?>
                <a href="login.php" class="auth-footer-btn">Back to Login</a>
                <button type="submit" name="request_code" form="recoveryForm" class="auth-footer-btn auth-footer-btn--accent">Send Verification Code</button>
            <?php else: ?>
                <a href="forgot_password.php" class="auth-footer-btn">Cancel / Resend Code</a>
                <button type="submit" name="verify_and_reset" form="recoveryForm" class="auth-footer-btn auth-footer-btn--accent">Reset Password</button>
            <?php endif; ?>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
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