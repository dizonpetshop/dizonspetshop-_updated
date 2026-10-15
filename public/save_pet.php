<?php
// Start the session so registration can be marked complete after saving the pet.
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/photo_upload.php';
require_once __DIR__ . '/db.php';
if (empty($_SESSION['user_id'])) { http_response_code(401); exit('Please sign in first.'); }
$servername = $host;
$username = $user;
$password = $pass;
$dbname = $db;

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

$conn->query("SET time_zone = '+00:00'");

// Save the pet only after receiving the registration form.
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $customer_id = isset($_POST['customer_id']) ? (int) $_POST['customer_id'] : 0;

    if ($customer_id <= 0) {
        die("Customer ID is missing.");
    }
    $owner = $pdo->prepare('SELECT id FROM customers WHERE id = ? AND email = ?');
    $owner->execute([$customer_id, $_SESSION['customer_email'] ?? '']);
    if (!$owner->fetchColumn()) { http_response_code(403); exit('You can only add pets to your own customer profile.'); }

    $pet_name   = $_POST['pet_name'] ?? '';
    $species    = $_POST['species'] ?? '';
    $breed      = $_POST['breed'] ?? '';
    $ageDob = trim($_POST['age_dob'] ?? '') ?: null;
    $gender = $_POST['pet_gender'] ?? null;
    if (($ageDob && strlen($ageDob) > 100) || ($gender && !in_array($gender, ['Male', 'Female'], true))) { http_response_code(400); exit('Enter valid pet age and gender details.'); }
    if (trim($pet_name) === '' || strlen($pet_name) > 100 || strlen($breed) > 100 || !in_array($species, ['Dog', 'Cat', 'Other'], true)) { http_response_code(400); exit('Enter a pet name, valid species, and breed.'); }

    try {
        $photoPath = saveUploadedPhoto($_FILES['pet_photo'] ?? [], 'pet');
        ensurePhotoColumn($conn, 'pets');
    } catch (RuntimeException | InvalidArgumentException $exception) {
        die($exception->getMessage());
    }

    $sql = "INSERT INTO pets (customer_id, pet_name, breed, species, photo_path, age_dob, gender) VALUES (?, ?, ?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($sql);

    if ($stmt) {
        $stmt->bind_param("issssss", $customer_id, $pet_name, $breed, $species, $photoPath, $ageDob, $gender);

        // A saved pet completes registration and unlocks the customer dashboard.
        if ($stmt->execute()) {
            $_SESSION['registration_completed'] = true;

            $stmt->close();
            $conn->close();

            header("Location: dashboard.php");
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
