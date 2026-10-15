<?php
// Shared protections for legacy forms. Existing token checks still apply.
if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $requestHost = $_SERVER['HTTP_HOST'] ?? '';
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site'
        || ($origin !== '' && strcasecmp((parse_url($origin, PHP_URL_HOST) ?? '') . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : ''), $requestHost) !== 0)) {
        http_response_code(403);
        exit('Cross-site form submissions are not allowed.');
    }
}
if (!empty($_SESSION['user_id'])) {
    $accountCheck = $pdo->prepare('SELECT role, account_status, email, password FROM users WHERE id = ?');
    $accountCheck->execute([(int) $_SESSION['user_id']]);
    $activeAccount = $accountCheck->fetch(PDO::FETCH_ASSOC);
    if (!$activeAccount || $activeAccount['account_status'] !== 'Active'
        || (isset($_SESSION['credential_version']) && !hash_equals($_SESSION['credential_version'], hash('sha256', $activeAccount['password'])))) {
        $_SESSION = [];
        session_destroy();
        http_response_code(403);
        exit('Your account is not active. Please sign in again.');
    }
    $_SESSION['role'] = $activeAccount['role'];
    $_SESSION['customer_email'] = $activeAccount['email'];
    $_SESSION['credential_version'] = hash('sha256', $activeAccount['password']);
}

// Legacy workflows publish into the same notification store as Next.js.
function notifyLegacyEvent(PDO $pdo, int $customerId, string $eventKey, string $title, string $message, string $relatedType, int $relatedId): void {
    $recipients = $pdo->prepare("SELECT DISTINCT u.id, u.role FROM users u LEFT JOIN customers c ON c.email=u.email WHERE u.account_status='Active' AND (u.role IN ('Admin','SuperAdmin') OR (u.role='User' AND c.id=?))");
    $recipients->execute([$customerId]);
    $insert = $pdo->prepare('INSERT IGNORE INTO notifications (recipient_id,event_key,title,message,type,related_type,related_id,link) VALUES (?,?,?,?,?,?,?,?)');
    foreach ($recipients->fetchAll(PDO::FETCH_ASSOC) as $recipient) {
        $link = $recipient['role'] === 'User' ? '/client/dashboard?view=reservations' : ($relatedType === 'appointment' ? '/admin/dashboard?view=reservations' : '/admin/dashboard?view=orders');
        $insert->execute([$recipient['id'], $eventKey, $title, $message, $relatedType === 'appointment' ? 'GROOMING_STATUS' : 'PRODUCT_STATUS', $relatedType, (string) $relatedId, $link]);
    }
}

function legacyProductImageSrc(?string $image): ?string {
    $image = trim($image ?? '');
    if ($image === '') return null;
    if (preg_match('#^data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$#i', $image)) return $image;
    if (preg_match('#^https?://#i', $image) && filter_var($image, FILTER_VALIDATE_URL)) return $image;
    $filename = basename(str_replace('\\', '/', $image));
    return is_file(__DIR__ . '/../pictures/' . $filename) ? '../pictures/' . rawurlencode($filename) : null;
}

function databaseTimestamp(string $value): int {
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->getTimestamp();
}
