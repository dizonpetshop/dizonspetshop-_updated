<?php
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/customer_access.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: ../auth/login.php");
    exit();
}

if (!hasCompletedCustomerRegistration($pdo)) {
    $_SESSION['registration_message'] = 'Please register your customer and pet information before accessing products or grooming services.';
    header("Location: register_customer.php");
    exit();
}

// Logged-in user's display name/email for the profile dropdown.
$user_name = $_SESSION['customer_name'] ?? ($_SESSION['user_name'] ?? 'User');
$user_email = $_SESSION['customer_email'] ?? ($_SESSION['user_email'] ?? '');

$customerStmt = $pdo->prepare('SELECT id FROM customers WHERE email = ? LIMIT 1');
$customerStmt->execute([$user_email]);
$customerId = (int) $customerStmt->fetchColumn();
$dashboardStats = ['pets' => 0, 'grooming' => 0, 'products' => 0];
$nextAppointment = null;
if ($customerId) {
    $statsStmt = $pdo->prepare(
        "SELECT
            (SELECT COUNT(*) FROM pets WHERE customer_id = ?) AS pets,
            (SELECT COUNT(*) FROM grooming_appointments WHERE customer_id = ? AND status IN ('Pending','Confirmed') AND TIMESTAMP(appointment_date, appointment_time) >= NOW()) AS grooming,
            (SELECT COUNT(*) FROM product_reservations WHERE customer_id = ? AND status IN ('Pending','Confirmed','Ready for Pickup')) AS products"
    );
    $statsStmt->execute([$customerId, $customerId, $customerId]);
    $dashboardStats = $statsStmt->fetch(PDO::FETCH_ASSOC) ?: $dashboardStats;
    $nextStmt = $pdo->prepare(
        "SELECT a.appointment_date, a.appointment_time, a.status, p.pet_name, s.style_name, g.groomer_name
         FROM grooming_appointments a INNER JOIN pets p ON p.id=a.pet_id INNER JOIN grooming_styles s ON s.style_id=a.grooming_style_id INNER JOIN groomers g ON g.groomer_id=a.groomer_id
         WHERE a.customer_id=? AND a.status IN ('Pending','Confirmed') AND TIMESTAMP(a.appointment_date,a.appointment_time)>=NOW()
         ORDER BY a.appointment_date,a.appointment_time LIMIT 1"
    );
    $nextStmt->execute([$customerId]);
    $nextAppointment = $nextStmt->fetch(PDO::FETCH_ASSOC);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="app-bg dashboard-page">
<script>
    document.body.classList.add('theme-' + (localStorage.getItem('petshopTheme') || 'dark'));
</script>

<!-- Header with sidebar toggle beside the logo, and a profile dropdown. -->
<div class="top-navbar">
    <div class="d-flex align-items-center gap-2">
        <button type="button" id="sidebarToggle" class="sidebar-toggle-btn" aria-label="Toggle sidebar" aria-expanded="true">
            <i class="fa-solid fa-bars"></i>
        </button>
        <img src="../images/cutoutlogo.png" alt="Dizon's Pet Grooming" class="navbar-logo">
        <span class="fw-bold fs-5 text-success">Dizon's Petshop Grooming</span>
    </div>

    <div class="dropdown">
        <a href="#" class="text-dark text-decoration-none dropdown-toggle hide-arrow" id="profileDropdown" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="fa-regular fa-circle-user fs-3 text-success"></i>
        </a>
        <ul class="dropdown-menu dropdown-menu-end mt-2 p-3" aria-labelledby="profileDropdown">
            <li class="text-center mb-2">
                <i class="fa-solid fa-circle-user text-success fs-1 mb-2"></i>
                <h6 class="fw-bold text-dark mb-0"><?php echo htmlspecialchars($user_name); ?></h6>
                <small class="text-muted"><?php echo htmlspecialchars($user_email); ?></small>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
                <div class="theme-switch" role="group" aria-label="Theme">
                    <div class="theme-switch-track">
                        <span class="theme-switch-thumb"></span>
                        <button type="button" class="theme-switch-option" data-theme-choice="dark"><i class="fa-solid fa-moon"></i><span>Dark</span></button>
                        <button type="button" class="theme-switch-option" data-theme-choice="light"><i class="fa-solid fa-sun"></i><span>Light</span></button>
                    </div>
                </div>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
                <a class="dropdown-item text-center rounded-2 py-2" href="profile.php">
                    <i class="fa-solid fa-id-card me-2"></i> View Profile
                </a>
            </li>
            <li>
                <a class="dropdown-item text-danger fw-bold text-center rounded-2 py-2" href="../auth/logout.php">
                    <i class="fa-solid fa-right-from-bracket me-2"></i> Logout
                </a>
            </li>
        </ul>
    </div>
</div>

<!-- Sidebar navigation. -->
<?php $activePage = 'dashboard'; include __DIR__ . '/sidebar.php'; ?>

<main class="app-main-content premium-dashboard-main">
    <section class="premium-dashboard-hero">
        <div><span class="dashboard-kicker">Good day, <?= htmlspecialchars(explode(' ', trim($user_name))[0] ?: 'Pet Parent') ?></span><h1>Care made beautifully simple.</h1><p>Appointments, pet essentials, and every important update—all in one calm place.</p><div class="dashboard-hero-actions"><a href="book_grooming.php" class="dashboard-primary-action"><i class="fa-solid fa-calendar-plus"></i> Book Grooming</a><a href="products.php" class="dashboard-secondary-action"><i class="fa-solid fa-bag-shopping"></i> Reserve Essentials</a></div></div>
        <div class="dashboard-pet-orbit"><span><i class="fa-solid fa-paw"></i></span><strong><?= (int) $dashboardStats['pets'] ?></strong><small>registered pet<?= (int) $dashboardStats['pets'] === 1 ? '' : 's' ?></small></div>
    </section>

    <section class="dashboard-stat-grid">
        <a href="my_appointments.php" class="dashboard-stat-card"><span class="blue"><i class="fa-solid fa-scissors"></i></span><div><small>Upcoming grooming</small><strong><?= (int) $dashboardStats['grooming'] ?></strong><p>View schedule</p></div><i class="fa-solid fa-arrow-right"></i></a>
        <a href="my_product_reservations.php" class="dashboard-stat-card"><span class="gold"><i class="fa-solid fa-bag-shopping"></i></span><div><small>Product reservations</small><strong><?= (int) $dashboardStats['products'] ?></strong><p>Manage pickup items</p></div><i class="fa-solid fa-arrow-right"></i></a>
        <a href="profile.php" class="dashboard-stat-card"><span class="green"><i class="fa-solid fa-shield-dog"></i></span><div><small>Pet profiles</small><strong><?= (int) $dashboardStats['pets'] ?></strong><p>Keep details updated</p></div><i class="fa-solid fa-arrow-right"></i></a>
    </section>

    <section class="dashboard-content-grid">
        <article class="dashboard-panel next-care-panel"><div class="dashboard-panel-heading"><div><span>Next care visit</span><h2>Your upcoming appointment</h2></div><a href="my_appointments.php">View all</a></div>
            <?php if ($nextAppointment): $nextTime = strtotime($nextAppointment['appointment_date'] . ' ' . $nextAppointment['appointment_time']); ?>
                <div class="next-appointment"><div class="next-date"><span><?= date('M', $nextTime) ?></span><strong><?= date('d', $nextTime) ?></strong></div><div><span class="status-dot"></span><small><?= htmlspecialchars($nextAppointment['status']) ?></small><h3><?= htmlspecialchars($nextAppointment['pet_name']) ?> · <?= htmlspecialchars($nextAppointment['style_name']) ?></h3><p><i class="fa-regular fa-clock"></i> <?= date('g:i A', $nextTime) ?> &nbsp; <i class="fa-solid fa-user-check"></i> <?= htmlspecialchars($nextAppointment['groomer_name']) ?></p></div></div>
            <?php else: ?><div class="dashboard-empty-state"><i class="fa-regular fa-calendar"></i><div><h3>No visit scheduled</h3><p>Give your pet a fresh, comfortable grooming day.</p></div><a href="book_grooming.php">Choose a schedule</a></div><?php endif; ?>
        </article>
        <article class="dashboard-panel care-shortcuts"><div class="dashboard-panel-heading"><div><span>Quick access</span><h2>Pet care shortcuts</h2></div></div><div class="shortcut-grid"><a href="products.php"><i class="fa-solid fa-bowl-food"></i><span>Food & treats</span></a><a href="products.php"><i class="fa-solid fa-pump-soap"></i><span>Hygiene care</span></a><a href="grooming.php"><i class="fa-solid fa-house-chimney-user"></i><span>Home grooming</span></a><a href="profile.php"><i class="fa-solid fa-paw"></i><span>Pet profiles</span></a></div></article>
    </section>
</main>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
    document.getElementById('sidebarToggle').addEventListener('click', function () {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
    });

    (function () {
        function refreshActiveState() {
            var current = localStorage.getItem('petshopTheme') || 'dark';
            document.querySelectorAll('.theme-switch-option').forEach(function (btn) {
                btn.classList.toggle('active', btn.dataset.themeChoice === current);
            });
            var track = document.querySelector('.theme-switch-track');
            if (track) track.classList.toggle('is-light', current === 'light');
        }
        refreshActiveState();

        document.querySelectorAll('.theme-switch-option').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                var choice = btn.dataset.themeChoice;
                document.body.classList.remove('theme-dark', 'theme-light');
                document.body.classList.add('theme-' + choice);
                localStorage.setItem('petshopTheme', choice);
                refreshActiveState();
            });
        });
    })();
</script>
</body>
</html>
cdn.jsdelivr.net
