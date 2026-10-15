<?php
// Check whether the logged-in customer has completed both required forms.
function hasCompletedCustomerRegistration(PDO $pdo): bool
{
    // Use the session flag when it was already confirmed during this session.
    if (!empty($_SESSION['registration_completed'])) {
        return true;
    }

    $email = trim($_SESSION['customer_email'] ?? '');
    if ($email === '') {
        return false;
    }

    // A customer is complete only when a matching pet record also exists.
    $stmt = $pdo->prepare(
        'SELECT c.id
         FROM customers c
         INNER JOIN pets p ON p.customer_id = c.id
         WHERE c.email = ?
         LIMIT 1'
    );
    $stmt->execute([$email]);

    if (!$stmt->fetchColumn()) {
        return false;
    }

    // Cache the successful database check for later protected pages.
    $_SESSION['registration_completed'] = true;
    return true;
}