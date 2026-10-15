<?php
require_once __DIR__ . '/../auth/session.php';
// Siguraduhing naka-log in ang user
if (!isset($_SESSION['user_id'])) {
    header("Location: ../auth/login.php");
    exit();
}

require_once __DIR__ . '/db.php';

$user_id = $_SESSION['user_id'];
$message = "";

// Kapag pinindot ang "I-save ang Pangalan"
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $new_username = trim($_POST['username']);

    // I-update ang username sa database (ang updated_at ay kusang magbabago ang oras)
    $sql = "UPDATE users SET username = ? WHERE id = ?";
    $stmt = $pdo->prepare($sql);
    
    if ($stmt->execute([$new_username, $user_id])) {
        $message = "Your name has been updated successfully!";
        // I-update din ang session para magbago agad sa UI
        $_SESSION['user_name'] = $new_username;
    } else {
        $message = "There was an error updating your name.";
    }
}

// Kunin ang kasalukuyang detalye ng user mula sa database
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$user_id]);
$user = $stmt->fetch();
?>

<!DOCTYPE html>
<html lang="tl">
<head>
    <meta charset="UTF-8">
    <title>I-edit ang Profile</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="p-5 bg-light">
    <div class="container" style="max-width: 500px;">
        <div class="card shadow p-4">
            <h3 class="mb-4 text-center">I-update ang Iyong Pangalan</h3>
            
            <?php if($message): ?>
                <div class="alert alert-info text-center"><?= htmlspecialchars($message) ?></div>
            <?php endif; ?>

            <form method="POST" action="">
                <div class="mb-3">
                    <label class="form-label fw-bold">Pangalan (Username):</label>
                    <input type="text" name="username" class="form-control" value="<?= htmlspecialchars($user['username']) ?>" required>
                </div>
                
                <button type="submit" class="btn btn-primary w-100 fw-bold">Save Changes</button>
            </form>
            
            <div class="text-center mt-3">
                <a href="dashboard.php" class="text-decoration-none">Bumalik sa Dashboard</a>
            </div>
        </div>
    </div>
</body>
</html>