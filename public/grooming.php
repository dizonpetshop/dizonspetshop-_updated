<?php
// Start the session and load the customer access helper.
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/customer_access.php';

// Protect grooming services from logged-out and unregistered visitors.
if (!isset($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit();
}

if (!hasCompletedCustomerRegistration($pdo)) {
    header('Location: register_customer.php');
    exit();
}

// Logged-in user's display name/email for the profile dropdown.
$user_name = $_SESSION['customer_name'] ?? ($_SESSION['user_name'] ?? 'User');
$user_email = $_SESSION['customer_email'] ?? ($_SESSION['user_email'] ?? '');
$upcomingStmt = $pdo->prepare(
    "SELECT COUNT(*)
     FROM grooming_appointments a
     INNER JOIN customers c ON c.id = a.customer_id
     WHERE c.email = ? AND a.status IN ('Pending', 'Confirmed','Checked In','In Progress')
       AND TIMESTAMP(a.appointment_date, a.appointment_time) > NOW()"
);
$upcomingStmt->execute([$user_email]);
$upcomingReservations = (int) $upcomingStmt->fetchColumn();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grooming Services - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:ital,wght@0,700;0,800;1,600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="app-bg grooming-page">
<script>
    // Agad na inilalapat ang huling tema (Dark/Light) bago mag-load ang buong pahina
    document.body.classList.add('theme-' + (localStorage.getItem('petshopTheme') || 'dark'));
</script>

<!-- Top Navigation Bar -->
<div class="top-navbar">
    <div class="d-flex align-items-center gap-2">
        <button type="button" id="sidebarToggle" class="sidebar-toggle-btn" aria-label="Toggle sidebar" aria-expanded="true">
            <i class="fa-solid fa-bars"></i>
        </button>
        <img src="../images/cutoutlogo.png" alt="Dizon's Pet Grooming" class="navbar-logo">
        <span class="fw-bold fs-5 text-success">Dizon's Petshop Grooming - Grooming Services</span>
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
            
            <!-- Theme Switcher Options -->
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
                <a class="dropdown-item text-center rounded-2 py-2" href="#" onclick="return false;">
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

<!-- Sidebar Navigation -->
<?php $activePage = 'grooming'; include __DIR__ . '/sidebar.php'; ?>

<!-- Main Content Area -->
<main class="app-main-content">
    <div class="service-page">

        <!-- Two-card layout: create a booking or manage existing reservations. -->
        <div class="row g-4 mb-4">
            
            <!-- Card 1: Grooming Hero / Appointment CTA -->
            <div class="col-md-6">
                <a href="book_grooming.php" class="grooming-hero h-100 d-flex flex-column justify-content-between text-decoration-none" aria-label="Book a grooming visit">
                    <div class="grooming-hero-decor" aria-hidden="true">
                        <i class="fa-solid fa-bone"></i>
                        <i class="fa-solid fa-paintbrush"></i>
                        <i class="fa-solid fa-soap"></i>
                        <i class="fa-solid fa-paw"></i>
                    </div>
                    <div>
                        <span class="grooming-hero-kicker">Dizon's Petshop Grooming</span>
                        <h1 class="grooming-hero-title">Grooming<br><span>Made Easy</span></h1>
                    </div>
                    <div>
                        <span class="grooming-hero-cta text-decoration-none d-inline-block">
                            <i class="fa-solid fa-calendar-plus"></i> Book a Grooming Visit
                        </span>
                    </div>
                </a>
            </div>

            <!-- Card 2: Reservation management -->
            <div class="col-md-6">
                <div class="grooming-actions h-100">
                    <a href="my_appointments.php" class="reservation-action-card h-100 text-decoration-none">
                        <span class="reservation-action-icon"><i class="fa-solid fa-calendar-check"></i></span>
                        <span class="reservation-action-kicker">Your grooming schedule</span>
                        <strong>My Reservations</strong>
                        <small>View upcoming visits, booking details, and previous appointments.</small>
                        <span class="reservation-action-footer"><b><?= $upcomingReservations ?></b> upcoming reservation<?= $upcomingReservations === 1 ? '' : 's' ?><i class="fa-solid fa-arrow-right"></i></span>
                    </a>
                </div>
            </div>

        </div>

</main>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
    // Sidebar toggle functionality
    document.getElementById('sidebarToggle').addEventListener('click', function () {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
    });

    // Theme switcher functionality
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
