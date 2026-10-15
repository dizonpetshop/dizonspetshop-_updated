<?php
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: ../auth/login.php");
    exit();
}

/*
|--------------------------------------------------------------------------
| Get logged-in user's information
|--------------------------------------------------------------------------
*/
$user_name = $_SESSION['user_name'] ?? 'User';
$user_email = $_SESSION['user_email'] ?? '';

/*
|--------------------------------------------------------------------------
| Find the registered customer information
|--------------------------------------------------------------------------
*/
$customer_email = trim($_SESSION['customer_email'] ?? $user_email);

$customer = null;

if ($customer_email !== '') {
    $customer_query = $pdo->prepare("
        SELECT id, customer_name, email, phone, address, photo_path
        FROM customers
        WHERE email = ?
        LIMIT 1
    ");

    $customer_query->execute([$customer_email]);
    $customer = $customer_query->fetch(PDO::FETCH_ASSOC) ?: null;
}
?>

<!DOCTYPE html>
<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>My Profile - Dizon's Petshop Grooming</title>

    <!-- Bootstrap -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">

    <!-- Google Font -->
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap" rel="stylesheet">

    <!-- Font Awesome -->
    <link rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <!-- Your CSS -->
    <link rel="stylesheet" href="../css/style.css">

</head>

<body class="app-bg dashboard-page">


<!-- =========================================================
     TOP NAVBAR
========================================================= -->

<div class="top-navbar">

    <div class="d-flex align-items-center gap-2">

        <button type="button"
                id="sidebarToggle"
                class="sidebar-toggle-btn"
                aria-label="Toggle sidebar"
                aria-expanded="true">

            <i class="fa-solid fa-bars"></i>

        </button>

        <img src="../images/cutoutlogo.png"
             alt="Dizon's Pet Grooming"
             class="navbar-logo">

        <span class="fw-bold fs-5 text-success">
            Dizon's Petshop Grooming
        </span>

    </div>


    <!-- PROFILE DROPDOWN -->

    <div class="dropdown">

        <a href="#"
           class="text-dark text-decoration-none dropdown-toggle hide-arrow"
           id="profileDropdown"
           data-bs-toggle="dropdown"
           aria-expanded="false">

            <i class="fa-regular fa-circle-user fs-3 text-success"></i>

        </a>


        <ul class="dropdown-menu dropdown-menu-end mt-2 p-3"
            aria-labelledby="profileDropdown">

            <li class="text-center mb-2">

                <i class="fa-solid fa-circle-user text-success fs-1 mb-2"></i>

                <h6 class="fw-bold text-dark mb-0">
                    <?php echo htmlspecialchars($user_name); ?>
                </h6>

                <small class="text-muted">
                    <?php echo htmlspecialchars($user_email); ?>
                </small>

            </li>


            <li>
                <hr class="dropdown-divider">
            </li>


            <li>

                <a class="dropdown-item text-center rounded-2 py-2"
                   href="profile.php">

                    <i class="fa-solid fa-id-card me-2"></i>
                    View Profile

                </a>

            </li>


            <li>
                <hr class="dropdown-divider">
            </li>


            <li>

                <a class="dropdown-item text-danger fw-bold text-center rounded-2 py-2"
                   href="../auth/logout.php">

                    <i class="fa-solid fa-right-from-bracket me-2"></i>
                    Logout

                </a>

            </li>

        </ul>

    </div>

</div>


<!-- =========================================================
     SIDEBAR
========================================================= -->

<?php $activePage = 'profile'; include __DIR__ . '/sidebar.php'; ?>


<!-- =========================================================
     MAIN CONTENT
========================================================= -->

<div class="app-main-content">

    <div class="profile-card">


        <!-- PAGE TITLE -->

        <div class="d-flex justify-content-between align-items-center mb-4">

            <div>

                <h4 class="fw-bold text-success mb-1">
                    My Profile
                </h4>

                <p class="text-muted mb-0">
                    View your registered customer information.
                </p>

            </div>


            <!-- EDIT PROFILE BUTTON -->

            <a href="register_customer.php"
               class="btn btn-success rounded-pill px-4">

                <i class="fa-solid fa-pen-to-square me-2"></i>
                Edit Profile

            </a>

        </div>


        <?php if ($customer): ?>


            <!-- =================================================
                 CUSTOMER INFORMATION
            ================================================== -->

            <div class="row">


                <!-- CUSTOMER PHOTO -->

                <div class="col-md-4 mb-4 mb-md-0">

                    <div class="left-avatar-box">

                        <div class="bg-white rounded-circle p-4 d-inline-block shadow-sm mb-3">

                            <?php if (!empty($customer['photo_path'])): ?>

                                <img src="<?php echo htmlspecialchars('photo.php?type=customer&id=' . (int) $customer['id']); ?>"
                                     alt="Customer Photo"
                                     class="profile-photo-preview">

                            <?php else: ?>

                                <i class="fa-solid fa-user text-secondary"
                                   style="font-size: 5rem;">
                                </i>

                            <?php endif; ?>

                        </div>


                        <div>

                            <div class="bg-success text-white py-2 px-4 rounded-pill fw-bold d-inline-block shadow-sm">

                                CUSTOMER

                            </div>

                        </div>

                    </div>

                </div>



                <!-- CUSTOMER DETAILS -->

                <div class="col-md-8">

                    <h5 class="fw-bold text-secondary mb-4">
                        Customer Information:
                    </h5>


                    <!-- FULL NAME -->

                    <div class="mb-3 row align-items-center">

                        <label class="col-sm-4 fw-bold text-success">
                            FULL NAME:
                        </label>

                        <div class="col-sm-8">

                            <div class="form-control bg-light">

                                <?php
                                echo htmlspecialchars(
                                    $customer['customer_name'] ?? ''
                                );
                                ?>

                            </div>

                        </div>

                    </div>



                    <!-- EMAIL -->

                    <div class="mb-3 row align-items-center">

                        <label class="col-sm-4 fw-bold text-success">
                            EMAIL:
                        </label>

                        <div class="col-sm-8">

                            <div class="form-control bg-light">

                                <?php
                                echo htmlspecialchars(
                                    $customer['email'] ?? ''
                                );
                                ?>

                            </div>

                        </div>

                    </div>



                    <!-- ADDRESS -->

                    <div class="mb-3 row align-items-center">

                        <label class="col-sm-4 fw-bold text-success">
                            ADDRESS:
                        </label>

                        <div class="col-sm-8">

                            <div class="form-control bg-light">

                                <?php
                                echo htmlspecialchars(
                                    $customer['address'] ?? ''
                                );
                                ?>

                            </div>

                        </div>

                    </div>



                    <!-- CONTACT NUMBER -->

                    <div class="mb-3 row align-items-center">

                        <label class="col-sm-4 fw-bold text-success">
                            CONTACT NUMBER:
                        </label>

                        <div class="col-sm-8">

                            <div class="form-control bg-light">

                                <?php
                                echo htmlspecialchars(
                                    $customer['phone'] ?? ''
                                );
                                ?>

                            </div>

                        </div>

                    </div>


                </div>

            </div>


        <?php else: ?>


            <!-- =================================================
                 NO CUSTOMER INFORMATION
            ================================================== -->

            <div class="text-center py-5">

                <i class="fa-solid fa-user-plus text-secondary"
                   style="font-size: 4rem;">
                </i>


                <h5 class="fw-bold mt-3">
                    No Customer Information Found
                </h5>


                <p class="text-muted">
                    You have not registered your customer information yet.
                </p>


                <a href="register_customer.php"
                   class="btn btn-success rounded-pill px-4">

                    <i class="fa-solid fa-user-plus me-2"></i>
                    Register Customer

                </a>

            </div>


        <?php endif; ?>


    </div>

</div>


<!-- =========================================================
     BOOTSTRAP
========================================================= -->

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>


<!-- =========================================================
     SIDEBAR TOGGLE
========================================================= -->

<script>

document.getElementById('sidebarToggle').addEventListener('click', function () {

    document.querySelector('.sidebar').classList.toggle('collapsed');

    document.body.classList.toggle('sidebar-collapsed');

});

</script>


</body>
</html>
cdn.jsdelivr.net
