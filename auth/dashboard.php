<?php
// Start the session and load the registration status checker.
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/../public/db.php';
require_once __DIR__ . '/../public/customer_access.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: ../auth/login.php");
    exit();
}

// Completed customers skip the welcome page and go to the service dashboard.
if (hasCompletedCustomerRegistration($pdo)) {
    header("Location: ../public/dashboard.php");
    exit();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="app-bg">

<!-- SIDEBAR NAVIGATION -->
<div class="sidebar">
    <a href="dashboard.php" class="nav-link active"><i class="fa-solid fa-house"></i> Dashboard</a>
    <a href="#" class="nav-link text-muted opacity-50" onclick="alert('Please register your customer and pet information before accessing Products.'); return false;"><i class="fa-solid fa-box-archive"></i> Products</a>
    <a href="#" class="nav-link text-muted opacity-50" onclick="alert('Please register your customer and pet information before accessing Grooming.'); return false;"><i class="fa-solid fa-scissors"></i> Grooming</a>
</div>

<!-- Welcome page for customers who still need to provide their details. -->
<div class="main-content welcome-page-content">
    <div class="logout-btn-dash">
        <a href="../auth/logout.php" class="btn btn-outline-danger btn-sm rounded-pill px-3 fw-bold"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
    </div>

    <div class="welcome-card">
        <h1 class="welcome-title">
            Welcome to<br>
            <span>Dizon's Petshop Grooming</span>
        </h1>
        <p>We care for dogs and cats with expert grooming services and quality pet products.</p>
        <div class="welcome-actions">
            <a href="../public/register_customer.php" class="btn btn-custom">REGISTER CUSTOMER & PET</a>
        </div>
    </div>

    <div class="info-card">
        <h2 class="info-title" style="color: #000;">About Our Website</h2>
        <div class="row" style="font-size: 0.95rem; color: #000;">
            <div class="col-md-6 mb-3">
                <p class="mb-2" style="color: #000;"><i class="fa-regular fa-clock text-success me-2"></i> <strong style="color: #000;">9:00 am to 7:00 pm</strong></p>
                <p class="mb-0" style="color: #000;"><i class="fa-solid fa-location-dot text-danger me-2"></i> 37 E Pascual St. Tangos, Navotas City</p>
            </div>
            <div class="col-md-6">
                <p class="mb-2" style="color: #000;"><i class="fa-solid fa-map-pin text-danger me-2"></i> <a href="#" class="text-decoration-none" style="color: #000;">Dizon's Petshop Grooming (Google map)</a></p>
                <p class="mb-0" style="color: #000;"><i class="fa-solid fa-phone text-success me-2"></i> 0945 260 8113</p>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>