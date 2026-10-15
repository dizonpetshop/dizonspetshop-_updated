<?php
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';

if (empty($_SESSION['user_id']) || strtolower(trim($_SESSION['role'] ?? '')) !== 'superadmin') {
    header('Location: ../auth/superadmin_login.php');
    exit;
}

$_SESSION['superadmin_csrf'] ??= bin2hex(random_bytes(32));
$message = $_SESSION['superadmin_message'] ?? null;
unset($_SESSION['superadmin_message']);
$allowedRoles = ['User', 'Admin', 'SuperAdmin'];
$allowedStatuses = ['Active', 'Suspended'];

function validSuperAdminPassword(string $password): bool {
    return strlen($password) >= 8
        && preg_match('/[a-z]/', $password)
        && preg_match('/[A-Z]/', $password)
        && preg_match('/\d/', $password)
        && preg_match('/[^A-Za-z0-9]/', $password);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_POST['csrf_token'] ?? '';
    $action = $_POST['action'] ?? '';
    try {
        if (!is_string($csrf) || !hash_equals($_SESSION['superadmin_csrf'], $csrf)) {
            throw new RuntimeException('Your Super Admin session expired. Please refresh and try again.');
        }

        if ($action === 'create_account') {
            $firstName = trim($_POST['first_name'] ?? '');
            $surname = trim($_POST['surname'] ?? '');
            $phone = preg_replace('/[\s()-]/', '', trim($_POST['phone_number'] ?? ''));
            $email = strtolower(trim($_POST['email'] ?? ''));
            $password = $_POST['password'] ?? '';
            $role = $_POST['role'] ?? '';
            if ($firstName === '' || $surname === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !in_array($role, $allowedRoles, true)) {
                throw new RuntimeException('Complete all required account fields.');
            }
            if ($phone !== '' && !preg_match('/^(?:\+63|0)9\d{9}$/', $phone)) {
                throw new RuntimeException('Enter a valid Philippine mobile number.');
            }
            if (!validSuperAdminPassword($password)) {
                throw new RuntimeException('Passwords require uppercase, lowercase, number, symbol, and at least 8 characters.');
            }
            $stmt = $pdo->prepare("INSERT INTO users (role,account_status,first_name,surname,phone_number,email,email_verified_at,password) VALUES (?,'Active',?,?,?,?,NOW(),?)");
            $stmt->execute([$role, $firstName, $surname, $phone ?: null, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $notice = $role . ' account created successfully.';
        } elseif ($action === 'update_account') {
            $userId = filter_var($_POST['user_id'] ?? null, FILTER_VALIDATE_INT);
            $role = $_POST['role'] ?? '';
            $status = $_POST['account_status'] ?? '';
            if (!$userId || $userId === (int) $_SESSION['user_id'] || !in_array($role, $allowedRoles, true) || !in_array($status, $allowedStatuses, true)) {
                throw new RuntimeException('Invalid account update. Your own Super Admin access is protected.');
            }
            $stmt = $pdo->prepare('UPDATE users SET role=?, account_status=? WHERE id=?');
            $stmt->execute([$role, $status, $userId]);
            $notice = 'Account role and access updated.';
        } else {
            throw new RuntimeException('Unknown Super Admin action.');
        }
        $_SESSION['superadmin_message'] = ['type' => 'success', 'text' => $notice];
    } catch (Throwable $exception) {
        $_SESSION['superadmin_message'] = [
            'type' => 'error',
            'text' => $exception instanceof PDOException && $exception->getCode() === '23000'
                ? 'That email is already registered.'
                : $exception->getMessage(),
        ];
    }
    header('Location: superadmin.php');
    exit;
}

$accounts = $pdo->query('SELECT id, role, account_status, first_name, surname, phone_number, email, created_at FROM users ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
$totalAccounts = count($accounts);
$adminCount = count(array_filter($accounts, fn($account) => strtolower($account['role']) === 'admin'));
$superAdminCount = count(array_filter($accounts, fn($account) => strtolower($account['role']) === 'superadmin'));
$activeCount = count(array_filter($accounts, fn($account) => $account['account_status'] === 'Active'));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Super Admin Center - DIZON'S Pet Grooming</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="superadmin-page">
<aside class="superadmin-sidebar"><div class="superadmin-brand"><img src="../images/cutoutlogo.png" alt="DIZON'S Pet Grooming"><span><strong>DIZON'S</strong><small>SUPER ADMIN</small></span></div><nav><a class="active" href="#overview"><i class="fa-solid fa-chart-pie"></i>Overview</a><a href="#accounts"><i class="fa-solid fa-users-gear"></i>Accounts</a><a href="#create-account"><i class="fa-solid fa-user-plus"></i>Create Account</a><a href="admin.php"><i class="fa-solid fa-store"></i>Admin Center</a></nav><a class="superadmin-logout" href="../auth/logout.php"><i class="fa-solid fa-right-from-bracket"></i>Logout</a></aside>
<main class="superadmin-main">
    <header class="superadmin-topbar"><button id="superAdminMenu" type="button" aria-label="Open menu"><i class="fa-solid fa-bars"></i></button><div><small>AUTHENTICATED SUPER ADMIN</small><strong><?= htmlspecialchars($_SESSION['user_name'] ?? 'Super Administrator') ?></strong></div></header>
    <?php if ($message): ?><div class="superadmin-notice <?= htmlspecialchars($message['type']) ?>"><?= htmlspecialchars($message['text']) ?></div><?php endif; ?>
    <section class="superadmin-hero" id="overview"><div><span>ACCOUNT GOVERNANCE</span><h1>Super Admin Center</h1><p>Create administrators, assign roles, and control account access from one protected workspace.</p></div><i class="fa-solid fa-shield-halved"></i></section>
    <section class="superadmin-stats"><article><i class="fa-solid fa-users"></i><span>Total accounts</span><strong><?= $totalAccounts ?></strong></article><article><i class="fa-solid fa-circle-check"></i><span>Active accounts</span><strong><?= $activeCount ?></strong></article><article><i class="fa-solid fa-user-tie"></i><span>Administrators</span><strong><?= $adminCount ?></strong></article><article><i class="fa-solid fa-shield"></i><span>Super Admins</span><strong><?= $superAdminCount ?></strong></article></section>
    <section class="superadmin-panel" id="create-account"><div class="superadmin-heading"><span>IDENTITY MANAGEMENT</span><h2>Create an account</h2><p>Passwords are securely hashed before storage.</p></div><form class="superadmin-create-form" method="POST"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['superadmin_csrf']) ?>"><input type="hidden" name="action" value="create_account"><label>First name<input name="first_name" required></label><label>Surname<input name="surname" required></label><label>Email address<input type="email" name="email" required></label><label>Phone number<input name="phone_number" inputmode="tel" pattern="(?:\+63|0)9[0-9]{9}" placeholder="09XXXXXXXXX"></label><label>Role<select name="role"><option>Admin</option><option>User</option><option>SuperAdmin</option></select></label><label>Temporary password<input type="password" name="password" minlength="8" required></label><button>Create Account</button></form></section>
    <section class="superadmin-panel" id="accounts"><div class="superadmin-heading"><span>ACCESS CONTROL</span><h2>System accounts</h2><p>Only the Super Admin can assign elevated roles.</p></div><div class="superadmin-table-wrap"><table><thead><tr><th>Account</th><th>Contact</th><th>Created</th><th>Role and access</th></tr></thead><tbody><?php foreach ($accounts as $account): ?><tr><td><strong><?= htmlspecialchars(trim(($account['first_name'] ?? '') . ' ' . ($account['surname'] ?? '')) ?: 'Unnamed account') ?></strong><small><?= (int) $account['id'] === (int) $_SESSION['user_id'] ? 'Current Super Admin' : htmlspecialchars($account['role']) ?></small></td><td><?= htmlspecialchars($account['email']) ?><small><?= htmlspecialchars($account['phone_number'] ?: 'No phone number') ?></small></td><td><?= date('M d, Y', databaseTimestamp($account['created_at'])) ?></td><td><?php if ((int) $account['id'] === (int) $_SESSION['user_id']): ?><span class="superadmin-protected">Protected active account</span><?php else: ?><form class="superadmin-inline-form" method="POST"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['superadmin_csrf']) ?>"><input type="hidden" name="action" value="update_account"><input type="hidden" name="user_id" value="<?= (int) $account['id'] ?>"><select name="role"><?php foreach ($allowedRoles as $role): ?><option <?= $account['role'] === $role ? 'selected' : '' ?>><?= htmlspecialchars($role) ?></option><?php endforeach; ?></select><select name="account_status"><?php foreach ($allowedStatuses as $status): ?><option <?= $account['account_status'] === $status ? 'selected' : '' ?>><?= htmlspecialchars($status) ?></option><?php endforeach; ?></select><button>Update</button></form><?php endif; ?></td></tr><?php endforeach; ?></tbody></table></div></section>
</main>
<script>document.getElementById('superAdminMenu').addEventListener('click',function(){document.querySelector('.superadmin-sidebar').classList.toggle('open');});</script>
</body>
</html>
