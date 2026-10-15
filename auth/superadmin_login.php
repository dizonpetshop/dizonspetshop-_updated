<?php
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/../public/db.php';

if (strtolower(trim($_SESSION['role'] ?? '')) === 'superadmin' && !empty($_SESSION['user_id'])) {
    header('Location: ../public/superadmin.php');
    exit;
}

$_SESSION['superadmin_login_csrf'] ??= bin2hex(random_bytes(32));
$error = '';
$setupAvailable = !(bool) $pdo->query("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(role)='superadmin')")->fetchColumn();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_POST['csrf_token'] ?? '';
    $email = strtolower(trim($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';

    if (!is_string($csrf) || !hash_equals($_SESSION['superadmin_login_csrf'], $csrf)) {
        $error = 'Your login session expired. Please refresh and try again.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
        $error = 'Enter your email address and password.';
    } else {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email=? AND LOWER(role)='superadmin' LIMIT 1");
        $stmt->execute([$email]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);
        $locked = $account && !empty($account['lockout_time']) && databaseTimestamp($account['lockout_time']) > time() - 900;

        if (!$account || ($account['account_status'] ?? 'Active') !== 'Active' || $locked || !password_verify($password, $account['password'])) {
            if ($account && !$locked) {
                $attempts = (int) ($account['failed_attempts'] ?? 0) + 1;
                $update = $pdo->prepare('UPDATE users SET failed_attempts=?, lockout_time=? WHERE id=?');
                $update->execute([$attempts >= 5 ? 0 : $attempts, $attempts >= 5 ? gmdate('Y-m-d H:i:s') : null, $account['id']]);
            }
            $error = $locked ? 'This account is temporarily locked. Try again after 15 minutes.' : 'Invalid Super Admin credentials.';
        } else {
            $pdo->prepare('UPDATE users SET failed_attempts=0, lockout_time=NULL WHERE id=?')->execute([$account['id']]);
            session_regenerate_id(true);
                $_SESSION['credential_version'] = hash('sha256', $account['password']);
            $_SESSION['user_id'] = (int) $account['id'];
            $_SESSION['role'] = 'SuperAdmin';
            $_SESSION['user_name'] = trim(($account['first_name'] ?? '') . ' ' . ($account['surname'] ?? '')) ?: 'Super Administrator';
            $_SESSION['customer_name'] = $_SESSION['user_name'];
            $_SESSION['customer_email'] = $account['email'];
            $_SESSION['last_activity'] = time();
            unset($_SESSION['superadmin_login_csrf']);
            header('Location: ../public/superadmin.php');
            exit;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Super Admin Login - DIZON'S Pet Grooming</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="auth-bg">
<main class="superadmin-login-shell"><section><img src="../images/cutoutlogo.png" alt="DIZON'S Pet Grooming"><small>SECURE CONTROL CENTER</small><h1>DIZON'S<br>PET GROOMING</h1><h2>Super Admin</h2><p>Sign in to manage administrator accounts and system access.</p></section><section class="superadmin-login-card">
    <?php if ($error): ?><div class="premium-notice error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <form method="POST"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['superadmin_login_csrf']) ?>"><label>Email address<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button>Sign in as Super Admin</button></form>
    <?php if ($setupAvailable): ?><a class="superadmin-setup-link" href="../public/superadmin_register.php">Create the first Super Admin account</a><?php endif; ?>
    <a class="superadmin-back-link" href="login.php">Regular account login</a>
</section></main>
</body>
</html>
