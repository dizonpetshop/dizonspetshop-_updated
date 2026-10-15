<?php
// Start the login session and load the shared database connection.
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/../public/db.php';

$error = '';
$success = $_SESSION['login_success'] ?? '';
unset($_SESSION['login_success']);
$adminExists = (bool) $pdo->query("SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(role) IN ('admin','superadmin'))")->fetchColumn();

// Authenticate only after the login form is submitted.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = strtolower(trim($_POST['email'] ?? ''));
    $password = $_POST['password'] ?? '';

    if ($email === '' || $password === '') {
        $error = "Please enter your email and password.";
    } else {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $locked = $row && !empty($row['lockout_time']) && databaseTimestamp($row['lockout_time']) + 900 > time();
        if ($locked) {
            $error = 'Invalid email or password.';
        } elseif ($row && ($row['account_status'] ?? 'Active') !== 'Active') {
            $error = 'Invalid email or password.';
        } elseif ($row) {
            if (password_verify($password, $row['password'])) {
                $pdo->prepare('UPDATE users SET failed_attempts=0,lockout_time=NULL WHERE id=?')->execute([$row['id']]);
                session_regenerate_id(true);
                $_SESSION['credential_version'] = hash('sha256', $row['password']);
                $_SESSION['user_id'] = $row['id'];
                $_SESSION['role']    = isset($row['role']) ? $row['role'] : 'Admin';
                $middleInitial = !empty($row['middle_initial']) ? rtrim($row['middle_initial'], '.') . '.' : '';
                $displayName = trim(implode(' ', array_filter([
                    $row['first_name'] ?? '',
                    $middleInitial,
                    $row['surname'] ?? '',
                ])));
                if ($displayName === '') {
                    $displayName = $row['username'] ?? 'User';
                }
                $_SESSION['customer_name'] = $displayName;
                $_SESSION['user_name'] = $displayName;
                $_SESSION['customer_email'] = $row['email'];
                // Force the access guard to verify customer and pet registration.
                unset($_SESSION['registration_completed'], $_SESSION['customer_id']);

                // Administrators enter the management workspace; customers enter the welcome page.
                $normalizedRole = strtolower(trim($row['role'] ?? ''));
                if ($normalizedRole === 'superadmin') {
                    header('Location: ../public/superadmin.php');
                } elseif ($normalizedRole === 'admin') {
                    header('Location: ../public/admin.php');
                } else {
                    header('Location: dashboard.php');
                }
                exit();
            } else {
                $pdo->beginTransaction();
                $pdo->prepare('UPDATE users SET failed_attempts=COALESCE(failed_attempts,0)+1 WHERE id=?')->execute([$row['id']]);
                $attemptLookup = $pdo->prepare('SELECT failed_attempts FROM users WHERE id=?');
                $attemptLookup->execute([$row['id']]);
                if ((int) $attemptLookup->fetchColumn() >= 5) $pdo->prepare('UPDATE users SET failed_attempts=0,lockout_time=? WHERE id=?')->execute([gmdate('Y-m-d H:i:s'),$row['id']]);
                $pdo->commit();
                $error = 'Invalid email or password.';
            }
        } else {
            $error = 'Invalid email or password.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:ital,wght@0,700;0,800;1,600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="auth-bg">

<div class="main-container">
    <div class="brand-side d-none d-md-flex">
        <div class="brand-mat">
            <img src="../images/cutoutlogo.png" alt="Dizon's Pet Grooming">
        </div>
    </div>

    <div class="login-side">
        <div class="login-card">
            <div class="text-center mb-3">
                <div class="auth-kicker">The</div>
                <h1 class="auth-brand-heading">DIZON'S<br>PETSHOP</h1>
                <h2 class="login-header">LOGIN</h2>
                <p class="auth-tagline">Welcome! Please enter your details.</p>
            </div>

            <?php if (!empty($error)): ?>
                <div class="alert alert-danger py-2 text-center" style="font-size: 0.85rem; border-radius: 15px;"><?= htmlspecialchars($error) ?></div>
            <?php endif; ?>
            <?php if (!empty($success)): ?>
                <div class="alert alert-success login-success-message py-3 text-center" role="status">
                    <i class="fa-solid fa-circle-check me-1"></i>
                    <?= htmlspecialchars($success) ?>
                </div>
            <?php endif; ?>

            <form action="login.php" method="POST">
                <div class="mb-3">
                    <label class="form-label fw-bold" style="font-size: 0.75rem;">EMAIL</label>
                    <input type="email" name="email" class="form-control" autocomplete="email" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold" style="font-size: 0.75rem;">PASSWORD</label>
                    <div class="password-field">
                        <input type="password" name="password" id="loginPassword" class="form-control" required>
                        <button type="button" class="password-toggle" data-target="loginPassword" aria-label="Show password">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-4" style="font-size: 0.82rem;">
                    <a href="forgot_password.php" class="text-decoration-none">Forgot Password?</a>
                    <a href="register.php" class="text-decoration-none text-success fw-bold">Register Account</a>
                </div>
                <button type="submit" class="btn btn-auth w-100 py-2 fw-bold">Login</button>
            </form>
            <?php if (!$adminExists): ?><p class="text-center mt-3 mb-0" style="font-size:.72rem;"><a href="../public/admin_register.php">Set up the first administrator</a></p><?php endif; ?>
            <p class="text-center mt-2 mb-0" style="font-size:.72rem;"><a href="superadmin_login.php">Super Admin login</a></p>
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
