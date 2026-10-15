<?php
date_default_timezone_set('Asia/Manila');

$host = getenv('DB_HOST') ?: '127.0.0.1';
$db   = getenv('DB_NAME') ?: 'petshop_db';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET time_zone = '+00:00'");
} catch (PDOException $e) {
    error_log('Petshop database connection failed: ' . $e->getMessage());
    http_response_code(503);
    die('The database is temporarily unavailable. Please try again later.');
}
require_once __DIR__ . '/request_security.php';

/**
 * Function para awtomatikong mag-save ng user activity log sa database.
 * 
 * @param PDO    $pdo      Ang database connection object
 * @param string $page_name Ang pangalan o title ng pahinang binisita
 */
function logUserActivity($pdo, $page_name) {
    if (session_status() === PHP_SESSION_NONE) {
        require_once __DIR__ . '/../auth/session.php';
    }

    if (isset($_SESSION['user_id'])) {
        try {
            $stmt = $pdo->prepare("INSERT INTO user_activity_logs (user_id, page_name, visited_at) VALUES (?, ?, NOW())");
            $stmt->execute([$_SESSION['user_id'], $page_name]);
        } catch (PDOException $e) {
            // Ipakita ang error kung sakaling may mali sa table column o database
            echo "Activity Log Error: " . $e->getMessage();
            exit();
        }
    }
}
?>
