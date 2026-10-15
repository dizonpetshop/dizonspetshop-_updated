<?php
// Start the session so the customer's registration details can be reused.
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/photo_upload.php';
require_once __DIR__ . '/db.php';
if (empty($_SESSION['user_id'])) { http_response_code(401); exit('Please sign in first.'); }

// Store the submitted customer identity for the next registration step.
$_SESSION['customer_name'] = $_POST['fullname'] ?? '';

$servername = $host;
$username = $user;
$password = $pass;
$dbname = $db;

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$conn->query("SET time_zone = '+00:00'");

// Insert the customer record only when the form was submitted.
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $customer_name = $_POST['fullname'] ?? '';
    $address       = $_POST['address'] ?? '';
    $email         = trim($_SESSION['customer_email'] ?? $_SESSION['user_email'] ?? '');
    $phone         = $_POST['number'] ?? '';
    $customer_id   = (int)($_POST['customer_id'] ?? 0);
    $action        = $_POST['action'] ?? 'create';
    if (!$email || trim($customer_name) === '' || !preg_match('/^(?:\+63|0)9\d{9}$/', $phone)) { http_response_code(400); exit('Enter a name and valid Philippine mobile number.'); }
    $ownCustomer = $pdo->prepare('SELECT id FROM customers WHERE email = ? LIMIT 1');
    $ownCustomer->execute([$email]);
    $existingCustomerId = (int) $ownCustomer->fetchColumn();
    if ($action === 'update' && $customer_id !== $existingCustomerId) { http_response_code(403); exit('Customer profile not found.'); }
    if ($existingCustomerId) { $customer_id = $existingCustomerId; $action = 'update'; }

    $_SESSION['customer_email'] = $email;

    try {
        $photoPath = saveUploadedPhoto($_FILES['customer_photo'] ?? [], 'customer');
        ensurePhotoColumn($conn, 'customers');
    } catch (RuntimeException | InvalidArgumentException $exception) {
        die($exception->getMessage());
    }

    if ($action === 'update' && $customer_id > 0) {
        if ($photoPath === null) {
            $sql = "UPDATE customers SET customer_name = ?, email = ?, phone = ?, address = ? WHERE id = ? AND email = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("ssssis", $customer_name, $email, $phone, $address, $customer_id, $email);
        } else {
            $sql = "UPDATE customers SET customer_name = ?, email = ?, phone = ?, address = ?, photo_path = ? WHERE id = ? AND email = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param("sssssis", $customer_name, $email, $phone, $address, $photoPath, $customer_id, $email);
        }

        if ($stmt && $stmt->execute()) {
            $_SESSION['registration_message'] = 'Your profile was updated successfully.';
            $stmt->close();
            $conn->close();
            header("Location: register_customer.php");
            exit();
        }

        echo "Error updating customer: " . ($stmt ? $stmt->error : $conn->error);
        $conn->close();
        exit();
    }

    $sql = "INSERT INTO customers (customer_name, email, phone, address, photo_path) VALUES (?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($sql);

    if ($stmt) {
        $stmt->bind_param("sssss", $customer_name, $email, $phone, $address, $photoPath);

        // Continue to pet registration after the customer is saved.
        if ($stmt->execute()) {
            $customer_id = $conn->insert_id;
            $_SESSION['customer_id'] = $customer_id;

            $stmt->close();
            $conn->close();

            header("Location: register_pet.php?customer_id=" . $customer_id);
            exit();
        } else {
            echo "Error executing query: " . $stmt->error;
        }
    } else {
        echo "Error preparing statement: " . $conn->error;
    }
}
$conn->close();
?>
