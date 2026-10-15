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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: products.php');
    exit;
}

$csrf = $_POST['csrf_token'] ?? '';
$productId = filter_var($_POST['product_id'] ?? null, FILTER_VALIDATE_INT);
$productName = trim((string) ($_POST['name'] ?? ''));
$quantity = filter_var($_POST['quantity'] ?? null, FILTER_VALIDATE_INT);

if (!is_string($csrf) || !hash_equals($_SESSION['product_csrf'] ?? '', $csrf)) {
    $_SESSION['product_message'] = [
        'type' => 'error',
        'text' => 'Your session expired. Please try again.',
    ];
} elseif ((!$productId && $productName === '') || !$quantity || $quantity < 1 || $quantity > 20) {
    $_SESSION['product_message'] = [
        'type' => 'error',
        'text' => 'Choose an available product and a quantity between 1 and 20.',
    ];
} else {
    try {
        $pdo->beginTransaction();

        $customerStmt = $pdo->prepare('SELECT id FROM customers WHERE email = ? LIMIT 1');
        $customerStmt->execute([$_SESSION['customer_email'] ?? '']);
        $customerId = $customerStmt->fetchColumn();

        if ($productId) {
            $productStmt = $pdo->prepare(
                'SELECT product_id, product_name, price, stock_quantity
                 FROM products
                 WHERE product_id = ? AND is_active = 1
                 FOR UPDATE'
            );
            $productStmt->execute([$productId]);
        } else {
            // Keep older forms that submit the product name working during migration.
            $productStmt = $pdo->prepare(
                'SELECT product_id, product_name, price, stock_quantity
                 FROM products
                 WHERE product_name = ? AND is_active = 1
                 LIMIT 1
                 FOR UPDATE'
            );
            $productStmt->execute([$productName]);
        }

        $product = $productStmt->fetch(PDO::FETCH_ASSOC);
        if (!$customerId || !$product) {
            throw new RuntimeException('The selected product is no longer available.');
        }
        if ((int) $product['stock_quantity'] < $quantity) {
            throw new RuntimeException(
                'Only ' . (int) $product['stock_quantity'] . ' item(s) are currently available.'
            );
        }

        $reservationCode = 'PR-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $totalAmount = (float) $product['price'] * $quantity;

        $reservationStmt = $pdo->prepare(
            'INSERT INTO product_reservations
                (reservation_code, customer_id, total_amount, reserved_until)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))'
        );
        $reservationStmt->execute([$reservationCode, $customerId, $totalAmount]);
        $reservationId = (int) $pdo->lastInsertId();

        $itemStmt = $pdo->prepare(
            'INSERT INTO product_reservation_items
                (reservation_id, product_id, quantity, unit_price)
             VALUES (?, ?, ?, ?)'
        );
        $itemStmt->execute([
            $reservationId,
            (int) $product['product_id'],
            $quantity,
            $product['price'],
        ]);

        $stockStmt = $pdo->prepare(
            'UPDATE products
             SET stock_quantity = stock_quantity - ?
             WHERE product_id = ?'
        );
        $stockStmt->execute([$quantity, (int) $product['product_id']]);
        notifyLegacyEvent($pdo, (int) $customerId, 'product-reservation.created.' . $reservationId, 'Product reservation received', $product['product_name'] . ' was reserved. Reference: ' . $reservationCode, 'product_reservation', $reservationId);

        $pdo->commit();
        $_SESSION['product_message'] = [
            'type' => 'success',
            'text' => $product['product_name'] . ' was reserved. Reference: '
                . $reservationCode . '. Pickup is held for 24 hours.',
        ];
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $_SESSION['product_message'] = [
            'type' => 'error',
            'text' => $exception->getMessage(),
        ];
    }
}

header('Location: products.php');
exit;
