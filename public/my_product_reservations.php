<?php
require_once __DIR__ . '/../auth/session.php';
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

$_SESSION['product_csrf'] ??= bin2hex(random_bytes(32));
$email = $_SESSION['customer_email'] ?? '';
$customerStmt = $pdo->prepare('SELECT id FROM customers WHERE email = ? LIMIT 1');
$customerStmt->execute([$email]);
$customerId = (int) $customerStmt->fetchColumn();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_POST['csrf_token'] ?? '';
    $reservationId = filter_var($_POST['reservation_id'] ?? null, FILTER_VALIDATE_INT);
    if (!is_string($csrf) || !hash_equals($_SESSION['product_csrf'], $csrf) || !$reservationId) {
        $_SESSION['product_reservation_message'] = ['type' => 'error', 'text' => 'Invalid cancellation request.'];
    } else {
        try {
            $pdo->beginTransaction();
            $lock = $pdo->prepare("SELECT reservation_id FROM product_reservations WHERE reservation_id = ? AND customer_id = ? AND status = 'Pending' FOR UPDATE");
            $lock->execute([$reservationId, $customerId]);
            if (!$lock->fetchColumn()) {
                throw new RuntimeException('This reservation can no longer be cancelled.');
            }
            $restore = $pdo->prepare(
                'UPDATE products p INNER JOIN product_reservation_items i ON i.product_id = p.product_id
                 SET p.stock_quantity = p.stock_quantity + i.quantity WHERE i.reservation_id = ?'
            );
            $restore->execute([$reservationId]);
            $cancel = $pdo->prepare("UPDATE product_reservations SET status = 'Cancelled' WHERE reservation_id = ?");
            $cancel->execute([$reservationId]);
            notifyLegacyEvent($pdo, $customerId, 'product-reservation.status.' . $reservationId . '.Cancelled', 'Product reservation cancelled', 'Reservation cancelled and stock released.', 'product_reservation', $reservationId);
            $pdo->commit();
            $_SESSION['product_reservation_message'] = ['type' => 'success', 'text' => 'Product reservation cancelled and stock released.'];
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $_SESSION['product_reservation_message'] = ['type' => 'error', 'text' => $exception->getMessage()];
        }
    }
    header('Location: my_product_reservations.php');
    exit;
}

$stmt = $pdo->prepare(
    "SELECT r.*, GROUP_CONCAT(CONCAT(p.product_name, ' × ', i.quantity) ORDER BY p.product_name SEPARATOR ', ') AS items
     FROM product_reservations r
     INNER JOIN product_reservation_items i ON i.reservation_id = r.reservation_id
     INNER JOIN products p ON p.product_id = i.product_id
     WHERE r.customer_id = ? GROUP BY r.reservation_id ORDER BY r.created_at DESC"
);
$stmt->execute([$customerId]);
$reservations = $stmt->fetchAll(PDO::FETCH_ASSOC);
$message = $_SESSION['product_reservation_message'] ?? null;
unset($_SESSION['product_reservation_message']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Product Reservations - Dizon's Petshop</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="app-bg product-reservations-page">
<div class="top-navbar"><div class="d-flex align-items-center gap-2"><button id="sidebarToggle" class="sidebar-toggle-btn"><i class="fa-solid fa-bars"></i></button><img src="../images/cutoutlogo.png" class="navbar-logo" alt="Dizon's"><strong>Product Reservations</strong></div><a href="products.php" class="premium-small-button"><i class="fa-solid fa-plus"></i> Reserve Products</a></div>
<?php $activePage = 'product_reservations'; include __DIR__ . '/sidebar.php'; ?>
<main class="app-main-content premium-list-page">
    <header class="premium-page-heading"><div><span>Pickup center</span><h1>My product reservations</h1><p>Reserved items are held for 24 hours unless confirmed by the shop.</p></div><strong><?= count($reservations) ?></strong></header>
    <?php if ($message): ?><div class="premium-notice <?= $message['type'] ?>"><?= htmlspecialchars($message['text']) ?></div><?php endif; ?>
    <div class="premium-record-list">
        <?php foreach ($reservations as $reservation): ?>
            <article class="premium-record-card"><div class="record-icon"><i class="fa-solid fa-bag-shopping"></i></div><div><small><?= htmlspecialchars($reservation['reservation_code']) ?></small><h2><?= htmlspecialchars($reservation['items']) ?></h2><p>Reserved <?= date('M d, Y · g:i A', databaseTimestamp($reservation['created_at'])) ?> · Hold until <?= date('M d, g:i A', databaseTimestamp($reservation['reserved_until'])) ?></p></div><div class="record-summary"><span class="reservation-status status-<?= strtolower(str_replace(' ', '-', $reservation['status'])) ?>"><?= htmlspecialchars($reservation['status']) ?></span><strong>PHP <?= number_format((float) $reservation['total_amount'], 2) ?></strong><?php if ($reservation['status'] === 'Pending'): ?><form method="POST"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['product_csrf']) ?>"><input type="hidden" name="reservation_id" value="<?= (int) $reservation['reservation_id'] ?>"><button class="text-action-danger" type="submit" onclick="return confirm('Cancel this product reservation?')">Cancel</button></form><?php endif; ?></div></article>
        <?php endforeach; ?>
        <?php if (!$reservations): ?><section class="reservation-empty"><span><i class="fa-solid fa-basket-shopping"></i></span><h2>No products reserved</h2><p>Browse essentials for your cat or dog and reserve them for pickup.</p><a href="products.php" class="booking-btn booking-btn-primary">Browse Products</a></section><?php endif; ?>
    </div>
</main>
<script>document.getElementById('sidebarToggle').addEventListener('click',()=>{document.querySelector('.sidebar').classList.toggle('collapsed');document.body.classList.toggle('sidebar-collapsed');});</script>
</body></html>
