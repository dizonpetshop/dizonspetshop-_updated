<?php
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';

$adminCount = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE LOWER(role)='admin'")->fetchColumn();
$isAdmin = strtolower(trim($_SESSION['role'] ?? '')) === 'superadmin';
if (!$isAdmin) {
    header('Location: ../auth/login.php');
    exit;
}

$_SESSION['admin_setup_csrf'] ??= bin2hex(random_bytes(32));
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_POST['csrf_token'] ?? '';
    $firstName = trim($_POST['first_name'] ?? '');
    $surname = trim($_POST['surname'] ?? '');
    $phone = trim($_POST['phone_number'] ?? '');
    $email = strtolower(trim($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';
    if (!is_string($csrf) || !hash_equals($_SESSION['admin_setup_csrf'], $csrf)) $error = 'Your setup session expired.';
    elseif ($firstName === '' || $surname === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $error = 'Complete all required account details.';
    elseif (strlen($password) < 8) $error = 'Use a password with at least 8 characters.';
    else {
        try {
            $stmt = $pdo->prepare("INSERT INTO users (role,account_status,first_name,surname,phone_number,email,email_verified_at,password) VALUES ('Admin','Active',?,?,?,?,NOW(),?)");
            $stmt->execute([$firstName, $surname, $phone, $email, password_hash($password, PASSWORD_DEFAULT)]);
            if ($adminCount === 0) {
                $_SESSION['user_id'] = (int) $pdo->lastInsertId();
                $_SESSION['role'] = 'Admin';
                $_SESSION['customer_name'] = $firstName . ' ' . $surname;
                $_SESSION['customer_email'] = $email;
            }
            header('Location: admin.php');
            exit;
        } catch (PDOException $exception) {
            $error = $exception->getCode() === '23000' ? 'That email is already registered.' : 'The administrator account could not be created.';
        }
    }
}
?>
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administrator Setup</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="../css/style.css"></head><body class="auth-bg"><main class="admin-setup-card"><span>Protected setup</span><h1><?= $adminCount === 0 ? 'Create the first administrator' : 'Create an administrator' ?></h1><p>This account can manage clients, inventory, prices, and reservations.</p><?php if($error): ?><div class="premium-notice error"><?= htmlspecialchars($error) ?></div><?php endif; ?><form method="POST"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_setup_csrf']) ?>"><div class="admin-setup-grid"><label>First name<input name="first_name" required></label><label>Surname<input name="surname" required></label></div><label>Phone number<input name="phone_number" inputmode="tel" required></label><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" minlength="8" required></label><button>Create Administrator</button></form><a href="../auth/login.php">Return to login</a></main></body></html>
