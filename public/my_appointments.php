<?php
require_once __DIR__ . '/../auth/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/customer_access.php';

if (empty($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit;
}

if (!hasCompletedCustomerRegistration($pdo)) {
    header('Location: register_customer.php');
    exit;
}

$email = trim($_SESSION['customer_email'] ?? '');
$customerStmt = $pdo->prepare('SELECT id, customer_name FROM customers WHERE email = ? LIMIT 1');
$customerStmt->execute([$email]);
$customer = $customerStmt->fetch(PDO::FETCH_ASSOC);

if (!$customer) {
    header('Location: register_customer.php');
    exit;
}

$_SESSION['reservation_csrf'] ??= generateToken();
$csrfToken = $_SESSION['reservation_csrf'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedCsrf = $_POST['csrf_token'] ?? '';
    $appointmentId = filter_var($_POST['appointment_id'] ?? null, FILTER_VALIDATE_INT);

    if (!is_string($submittedCsrf) || !hash_equals($csrfToken, $submittedCsrf)) {
        $_SESSION['reservation_flash'] = ['type' => 'error', 'message' => 'Your session expired. Please try again.'];
    } elseif (!$appointmentId) {
        $_SESSION['reservation_flash'] = ['type' => 'error', 'message' => 'Invalid reservation.'];
    } else {
        $lookup = $pdo->prepare(
            "SELECT a.reservation_code, a.appointment_date, a.appointment_time, p.pet_name
             FROM grooming_appointments a
             INNER JOIN pets p ON p.id = a.pet_id
             WHERE a.appointment_id = ? AND a.customer_id = ? LIMIT 1"
        );
        $lookup->execute([$appointmentId, $customer['id']]);
        $reservation = $lookup->fetch(PDO::FETCH_ASSOC);

        $cancel = $pdo->prepare(
            "UPDATE grooming_appointments
             SET status = 'Cancelled', cancelled_at = NOW()
             WHERE appointment_id = ? AND customer_id = ?
               AND status IN ('Pending', 'Confirmed')
               AND TIMESTAMP(appointment_date, appointment_time) > DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)"
        );
        $cancel->execute([$appointmentId, $customer['id']]);

        if ($reservation && $cancel->rowCount() === 1) {
            notifyLegacyEvent($pdo, (int) $customer['id'], 'appointment.status.' . $appointmentId . '.Cancelled', 'Grooming appointment cancelled', 'Reservation ' . $reservation['reservation_code'] . ' was cancelled.', 'appointment', $appointmentId);
            $_SESSION['reservation_flash'] = ['type' => 'success', 'message' => 'Reservation ' . $reservation['reservation_code'] . ' was cancelled.'];
            $message = '<html><body style="margin:0;background:#edf5ff;font-family:Arial,sans-serif;color:#10214d;padding:32px 12px;">'
                . '<div style="max-width:560px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 14px 36px rgba(16,33,77,.14);">'
                . '<div style="background:#10214d;color:#fff;text-align:center;padding:28px;"><h1 style="margin:0;font-size:23px;">Reservation cancelled</h1></div>'
                . '<div style="padding:30px;text-align:center;"><p>Your grooming reservation for <strong>' . htmlspecialchars($reservation['pet_name']) . '</strong> has been cancelled.</p>'
                . '<p style="color:#6e7d94;">Reference: <strong>' . htmlspecialchars($reservation['reservation_code']) . '</strong></p>'
                . '<a href="' . htmlspecialchars(buildUrl('book_grooming.php')) . '" style="display:inline-block;margin-top:12px;background:#2f6edf;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;">Book another visit</a>'
                . '</div></div></body></html>';
            sendMail($email, 'Reservation Cancelled - ' . $reservation['reservation_code'], $message, true);
        } else {
            $_SESSION['reservation_flash'] = ['type' => 'error', 'message' => 'This reservation can no longer be cancelled.'];
        }
    }

    header('Location: my_appointments.php');
    exit;
}

$appointmentsStmt = $pdo->prepare(
    "SELECT a.*, p.pet_name, p.species, s.style_name, g.groomer_name, addon_list.addon_names
     FROM grooming_appointments a
     INNER JOIN pets p ON p.id = a.pet_id
     INNER JOIN grooming_styles s ON s.style_id = a.grooming_style_id
     INNER JOIN groomers g ON g.groomer_id = a.groomer_id
     LEFT JOIN (
        SELECT aa.appointment_id, GROUP_CONCAT(ga.addon_name ORDER BY ga.addon_name SEPARATOR ', ') AS addon_names
        FROM appointment_addons aa
        INNER JOIN grooming_addons ga ON ga.addon_id = aa.addon_id
        GROUP BY aa.appointment_id
     ) addon_list ON addon_list.appointment_id = a.appointment_id
     WHERE a.customer_id = ?
     ORDER BY
        CASE
            WHEN a.status IN ('Pending', 'Confirmed')
                AND TIMESTAMP(a.appointment_date, a.appointment_time) >= NOW() THEN 0
            ELSE 1
        END,
        CASE
            WHEN a.status IN ('Pending', 'Confirmed')
                AND TIMESTAMP(a.appointment_date, a.appointment_time) >= NOW()
            THEN TIMESTAMP(a.appointment_date, a.appointment_time)
        END ASC,
        a.appointment_date DESC,
        a.appointment_time DESC,
        a.appointment_id DESC"
);
$appointmentsStmt->execute([$customer['id']]);
$appointments = $appointmentsStmt->fetchAll(PDO::FETCH_ASSOC);
$flash = $_SESSION['reservation_flash'] ?? null;
unset($_SESSION['reservation_flash']);
$userName = $_SESSION['customer_name'] ?? $customer['customer_name'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Reservations - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="app-bg reservations-page">
<script>document.body.classList.add('theme-' + (localStorage.getItem('petshopTheme') || 'dark'));</script>

<div class="top-navbar">
    <div class="d-flex align-items-center gap-2">
        <button type="button" id="sidebarToggle" class="sidebar-toggle-btn" aria-label="Toggle sidebar"><i class="fa-solid fa-bars"></i></button>
        <img src="../images/cutoutlogo.png" alt="Dizon's Pet Grooming" class="navbar-logo">
        <span class="fw-bold fs-5 text-success">My Reservations</span>
    </div>
    <a href="book_grooming.php" class="booking-btn booking-btn-primary reservation-new-btn"><i class="fa-solid fa-plus"></i> New Reservation</a>
</div>

<?php $activePage = 'reservations'; include __DIR__ . '/sidebar.php'; ?>

<main class="app-main-content reservations-main">
    <header class="reservations-heading">
        <div><span>Grooming schedule</span><h1>My reservations</h1><p>Review upcoming visits and keep track of previous grooming appointments.</p></div>
        <div class="reservation-count"><strong><?= count($appointments) ?></strong><span>Total reservations</span></div>
    </header>

    <?php if ($flash): ?>
        <div class="reservation-flash <?= $flash['type'] === 'success' ? 'success' : 'error' ?>"><i class="fa-solid <?= $flash['type'] === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation' ?>"></i><?= htmlspecialchars($flash['message']) ?></div>
    <?php endif; ?>

    <?php if ($appointments): ?>
        <div class="reservation-filters" role="group" aria-label="Filter reservations">
            <button type="button" class="active" data-reservation-filter="all">All</button>
            <button type="button" data-reservation-filter="upcoming">Upcoming</button>
            <button type="button" data-reservation-filter="completed">Completed</button>
            <button type="button" data-reservation-filter="cancelled">Cancelled</button>
            <button type="button" data-reservation-filter="past">Past</button>
        </div>
        <div class="reservation-list">
            <?php foreach ($appointments as $appointment):
                $appointmentTimestamp = strtotime($appointment['appointment_date'] . ' ' . $appointment['appointment_time']);
                $canCancel = in_array($appointment['status'], ['Pending', 'Confirmed'], true) && $appointmentTimestamp > time();
                $filterGroup = $canCancel
                    ? 'upcoming'
                    : (in_array($appointment['status'], ['Completed', 'Cancelled'], true)
                        ? strtolower($appointment['status'])
                        : 'past');
            ?>
                <article class="reservation-card" data-reservation-group="<?= $filterGroup ?>">
                    <div class="reservation-date"><span><?= date('M', $appointmentTimestamp) ?></span><strong><?= date('d', $appointmentTimestamp) ?></strong><small><?= date('Y', $appointmentTimestamp) ?></small></div>
                    <div class="reservation-details">
                        <div class="reservation-card-top"><div><span class="reservation-reference"><?= htmlspecialchars($appointment['reservation_code']) ?></span><h2><?= htmlspecialchars($appointment['pet_name']) ?> · <?= htmlspecialchars($appointment['style_name']) ?></h2></div><span class="reservation-status status-<?= strtolower($appointment['status']) ?>"><?= htmlspecialchars($appointment['status']) ?></span></div>
                        <div class="reservation-meta">
                            <span><i class="fa-solid fa-clock"></i><?= date('g:i A', $appointmentTimestamp) ?></span>
                            <span><i class="fa-solid fa-user-check"></i><?= htmlspecialchars($appointment['groomer_name']) ?></span>
                            <span><i class="fa-solid fa-location-dot"></i><?= htmlspecialchars($appointment['booking_type']) ?></span>
                            <span><i class="fa-solid fa-paw"></i><?= htmlspecialchars($appointment['pet_size']) ?> <?= htmlspecialchars($appointment['species']) ?></span>
                        </div>
                        <?php if ($appointment['addon_names']): ?><p class="reservation-addons"><strong>Add-ons:</strong> <?= htmlspecialchars($appointment['addon_names']) ?></p><?php endif; ?>
                    </div>
                    <div class="reservation-card-action"><span>Total</span><strong>PHP <?= number_format((float) $appointment['total_price'], 2) ?></strong><?php if ($canCancel): ?><button type="button" class="cancel-reservation-btn" data-bs-toggle="modal" data-bs-target="#cancelModal" data-appointment-id="<?= (int) $appointment['appointment_id'] ?>" data-reference="<?= htmlspecialchars($appointment['reservation_code']) ?>">Cancel</button><?php endif; ?></div>
                </article>
            <?php endforeach; ?>
        </div>
    <?php else: ?>
        <section class="reservation-empty"><span><i class="fa-solid fa-calendar-plus"></i></span><h2>No reservations yet</h2><p>Your upcoming and previous grooming visits will appear here.</p><a href="book_grooming.php" class="booking-btn booking-btn-primary">Book Your First Visit</a></section>
    <?php endif; ?>
</main>

<div class="modal fade" id="cancelModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content reservation-modal"><div class="modal-body"><span class="reservation-modal-icon"><i class="fa-solid fa-calendar-xmark"></i></span><h2>Cancel reservation?</h2><p>You are about to cancel <strong id="cancelReference"></strong>. This will release the selected schedule.</p><form method="POST" id="cancelForm"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken) ?>"><input type="hidden" name="appointment_id" id="cancelAppointmentId"><div class="reservation-modal-actions"><button type="button" class="booking-btn booking-btn-secondary" data-bs-dismiss="modal">Keep Reservation</button><button type="submit" class="booking-btn reservation-danger-btn">Yes, Cancel</button></div></form></div></div></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
document.getElementById('sidebarToggle').addEventListener('click', function () { document.querySelector('.sidebar').classList.toggle('collapsed'); document.body.classList.toggle('sidebar-collapsed'); });
document.querySelectorAll('[data-reservation-filter]').forEach(function (button) { button.addEventListener('click', function () { document.querySelectorAll('[data-reservation-filter]').forEach(item => item.classList.remove('active')); button.classList.add('active'); const filter = button.dataset.reservationFilter; document.querySelectorAll('.reservation-card').forEach(card => card.hidden = filter !== 'all' && card.dataset.reservationGroup !== filter); }); });
document.querySelectorAll('.cancel-reservation-btn').forEach(function (button) { button.addEventListener('click', function () { document.getElementById('cancelAppointmentId').value = button.dataset.appointmentId; document.getElementById('cancelReference').textContent = button.dataset.reference; }); });
document.getElementById('cancelForm')?.addEventListener('submit', function () { const button = this.querySelector('[type="submit"]'); button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cancelling...'; });
</script>
</body>
</html>
