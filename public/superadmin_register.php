<?php
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';
if (empty($_SESSION['user_id']) || strtolower(trim($_SESSION['role'] ?? '')) !== 'admin') {
    header('Location: ../auth/login.php');
    exit;
}

$superAdminCount = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE LOWER(role)='superadmin'")->fetchColumn();
if ($superAdminCount > 0) {
    header('Location: ../auth/superadmin_login.php');
    exit;
}

$_SESSION['superadmin_setup_csrf'] ??= bin2hex(random_bytes(32));
$error = '';

function superAdminPasswordIsStrong(string $password): bool {
    return strlen($password) >= 8
        && preg_match('/[a-z]/', $password)
        && preg_match('/[A-Z]/', $password)
        && preg_match('/\d/', $password)
        && preg_match('/[^A-Za-z0-9]/', $password);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_POST['csrf_token'] ?? '';
    $firstName = trim($_POST['first_name'] ?? '');
    $surname = trim($_POST['surname'] ?? '');
    $phone = preg_replace('/[\s()-]/', '', trim($_POST['phone_number'] ?? ''));
    $email = strtolower(trim($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';
    $confirmation = $_POST['password_confirmation'] ?? '';

    if (!is_string($csrf) || !hash_equals($_SESSION['superadmin_setup_csrf'], $csrf)) {
        $error = 'Your setup session expired. Please refresh and try again.';
    } elseif ($firstName === '' || $surname === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Complete all required account details.';
    } elseif (!preg_match('/^(?:\+63|0)9\d{9}$/', $phone)) {
        $error = 'Enter a valid Philippine mobile number.';
    } elseif (!superAdminPasswordIsStrong($password)) {
        $error = 'Use at least 8 characters with uppercase, lowercase, number, and symbol.';
    } elseif (!hash_equals($password, $confirmation)) {
        $error = 'The password confirmation does not match.';
    } else {
        try {
            $pdo->beginTransaction();
            $existing = $pdo->query("SELECT id FROM users WHERE LOWER(role)='superadmin' LIMIT 1 FOR UPDATE")->fetchColumn();
            if ($existing) {
                throw new RuntimeException('Super Admin setup is already complete.');
            }
            $stmt = $pdo->prepare("INSERT INTO users (role,account_status,first_name,surname,phone_number,email,email_verified_at,password) VALUES ('SuperAdmin','Active',?,?,?,?,NOW(),?)");
            $stmt->execute([$firstName, $surname, $phone, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int) $pdo->lastInsertId();
            $pdo->commit();

            session_regenerate_id(true);
            $_SESSION['user_id'] = $userId;
            $_SESSION['role'] = 'SuperAdmin';
            $_SESSION['user_name'] = trim($firstName . ' ' . $surname);
            $_SESSION['customer_name'] = $_SESSION['user_name'];
            $_SESSION['customer_email'] = $email;
            $_SESSION['last_activity'] = time();
            unset($_SESSION['superadmin_setup_csrf']);
            header('Location: superadmin.php');
            exit;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $error = $exception instanceof PDOException && $exception->getCode() === '23000'
                ? 'That email is already registered.'
                : $exception->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Super Admin Setup - DIZON'S Pet Grooming</title>
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="auth-bg">
<main class="admin-setup-card superadmin-setup-card">
    <span>One-time protected setup</span>
    <h1>Create the Super Admin</h1>
    <p>This account controls administrator access for DIZON'S Pet Grooming. Setup closes automatically after creation.</p>
    <?php if ($error): ?><div class="premium-notice error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <form method="POST" autocomplete="off">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['superadmin_setup_csrf']) ?>">
        <div class="admin-setup-grid"><label>First name<input name="first_name" required></label><label>Surname<input name="surname" required></label></div>
        <label>Philippine mobile number<input name="phone_number" inputmode="tel" pattern="(?:\+63|0)9[0-9]{9}" placeholder="09XXXXXXXXX" required></label>
        <label>Email address<input type="email" name="email" autocomplete="username" required></label>
        <label>Password<input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
        <label>Confirm password<input type="password" name="password_confirmation" autocomplete="new-password" minlength="8" required></label>
        <button>Create Super Admin Account</button>
    </form>
    <a href="../auth/superadmin_login.php">Return to Super Admin login</a>
</main>
</body>
</html>
