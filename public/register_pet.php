<?php
require_once __DIR__ . '/../auth/session.php';
$_SESSION['started'] = true;
require_once __DIR__ . '/db.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: dashboard.php");
    exit();
}

$user_name = isset($_SESSION['user_name']) ? $_SESSION['user_name'] : 'User';
$user_email = $_SESSION['customer_email'] ?? ($_SESSION['user_email'] ?? '');
$customerLookup = $pdo->prepare('SELECT id FROM customers WHERE email = ? LIMIT 1');
$customerLookup->execute([$user_email]);
$customerId = (int) $customerLookup->fetchColumn();
if (!$customerId) { header('Location: register_customer.php'); exit; }
if (isset($_GET['customer_id']) && (int) $_GET['customer_id'] !== $customerId) { http_response_code(403); exit('Customer profile not found.'); }
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register Pet - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="app-bg">

<!-- TOP NAVBAR -->
<div class="top-navbar">
    <div class="d-flex align-items-center gap-3">
        <i class="fa-solid fa-bars fs-4 text-secondary" style="cursor: pointer;"></i>
        <span class="fw-bold fs-5 text-success">Dizon's Petshop Grooming</span>
    </div>
    
    <div class="dropdown">
        <a href="#" class="text-dark text-decoration-none dropdown-toggle hide-arrow" id="profileDropdown" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="fa-regular fa-circle-user fs-3 text-success"></i>
        </a>
        <ul class="dropdown-menu dropdown-menu-end mt-2" aria-labelledby="profileDropdown">
            <li class="text-center mb-3">
                <i class="fa-solid fa-circle-user text-success fs-1 mb-2"></i>
                <h6 class="fw-bold text-dark mb-0"><?php echo htmlspecialchars($user_name); ?></h6>
                <small class="text-muted"><?php echo htmlspecialchars($user_email); ?></small>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
                <div class="px-3 py-1 text-secondary" style="font-size: 0.85rem;">
                </div>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
                <a class="dropdown-item text-danger fw-bold rounded-2 text-center py-2" href="../auth/logout.php">
                    <i class="fa-solid fa-right-from-bracket me-2"></i> Logout
                </a>
            </li>
        </ul>
    </div>
</div>


<!-- MAIN CONTENT -->
<div class="app-main-content">
    <div class="profile-card">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h4 class="fw-bold text-success mb-0">Pet Profile</h4>
            <div>
                <button class="btn btn-custom btn-sm">Edit</button>
            </div>
        </div>

        <div class="row">
            <div class="col-md-4 mb-4 mb-md-0">
                <div class="left-avatar-box">
                    <div class="bg-white rounded-circle p-4 d-inline-block shadow-sm mb-3">
                        <img id="pet-photo-preview" class="profile-photo-preview d-none" alt="Pet photo preview">
                        <i class="fa-solid fa-paw text-success" style="font-size: 5rem;"></i>
                    </div>
                    <div class="d-flex justify-content-center gap-3 mb-3 text-dark fs-5">
                        <label for="pet-photo" class="cursor-pointer" title="Choose a pet photo"><i class="fa-solid fa-image"></i></label>
                    </div>
                    <div class="bg-success text-white py-2 px-4 rounded-pill fw-bold d-inline-block shadow-sm">
                        PET PROFILE
                    </div>
                </div>
            </div>

            <div class="col-md-8">
                <form action="save_pet.php" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="customer_id" value="<?php echo $customerId; ?>">
                    <input type="file" id="pet-photo" name="pet_photo" accept="image/jpeg,image/png,image/gif,image/webp" capture="environment" class="visually-hidden">
                    <h5 class="fw-bold text-secondary mb-3">Pet Information:</h5>
                    
                    <div class="mb-3 row align-items-center">
                        <label class="col-sm-3 fw-bold text-success">PET NAME:</label>
                        <div class="col-sm-9">
                            <input type="text" name="pet_name" class="form-control" required>
                        </div>
                    </div>

                    <div class="mb-3 row align-items-center">
                        <label class="col-sm-3 fw-bold text-success">PET:</label>
                        <div class="col-sm-9">
                            <select name="species" class="form-control" required>
                                <option value="">Select a pet type</option>
                                <option value="Dog">Dog</option>
                                <option value="Cat">Cat</option>    
                            </select>
                        </div>
                    </div>

                    <div class="mb-3 row align-items-center">
                        <label class="col-sm-3 fw-bold text-success">BREED:</label>
                        <div class="col-sm-9">
                            <input type="text" name="breed" class="form-control" required>
                        </div>
                    </div>

                    <div class="mb-3 row align-items-center">
                        <label class="col-sm-3 fw-bold text-success">AGE / DOB:</label>
                        <div class="col-sm-9">
                            <input type="text" name="age_dob" class="form-control" placeholder="e.g., 2 years old / Age" required>
                        </div>
                    </div>

                    <div class="mb-3 row align-items-center">
                        <label class="col-sm-3 fw-bold text-success">GENDER:</label>
                        <div class="col-sm-9">
                            <select name="pet_gender" class="form-control" required>
                                <option value="">Select Gender</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </div>
                    </div>

                    <div class="mb-4 row align-items-center">
                        <label class="col-sm-3 fw-bold text-success">OWNER NAME:</label>
                        <div class="col-sm-9">
                            <input type="text" name="owner_name" class="form-control" required>
                        </div>
                    </div>

                    <div class="d-flex justify-content-between">
                        <button type="submit" class="btn btn-success rounded-pill px-4 fw-bold">Save Pet</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script>
// Preview the selected pet photo before the form is submitted.
document.getElementById('pet-photo').addEventListener('change', function () {
    const preview = document.getElementById('pet-photo-preview');
    const placeholder = preview.nextElementSibling;
    const file = this.files[0];

    if (!file) {
        preview.classList.add('d-none');
        placeholder.classList.remove('d-none');
        return;
    }

    preview.src = URL.createObjectURL(file);
    preview.classList.remove('d-none');
    placeholder.classList.add('d-none');
});
</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
