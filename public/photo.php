<?php
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';
if (empty($_SESSION['user_id'])) { http_response_code(401); exit; }
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$type = $_GET['type'] ?? '';
if (!$id || !in_array($type, ['customer', 'pet'], true)) { http_response_code(404); exit; }
if ($type === 'customer') {
    $lookup = $pdo->prepare('SELECT photo_path, email FROM customers WHERE id=?');
} else {
    $lookup = $pdo->prepare('SELECT p.photo_path, c.email FROM pets p JOIN customers c ON c.id=p.customer_id WHERE p.id=?');
}
$lookup->execute([$id]); $record = $lookup->fetch(PDO::FETCH_ASSOC);
$admin = in_array($_SESSION['role'] ?? '', ['Admin', 'SuperAdmin'], true);
if (!$record || (!$admin && strcasecmp($record['email'] ?? '', $_SESSION['customer_email'] ?? '') !== 0)) { http_response_code(404); exit; }
$value = $record['photo_path'] ?? '';
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
if (preg_match('#^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$#i', $value, $match)) {
    header('Content-Type: ' . $match[1]); echo base64_decode($match[2], true); exit;
}
if (!preg_match('#^uploads/([\w.-]+\.(?:jpe?g|png|webp|gif))$#i', $value, $match)) { http_response_code(404); exit; }
$path = __DIR__ . '/uploads/' . $match[1];
if (!is_file($path)) { http_response_code(404); exit; }
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
if (!in_array($mime, ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], true)) { http_response_code(404); exit; }
header('Content-Type: ' . $mime); readfile($path);
