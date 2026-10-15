<?php
require_once __DIR__ . '/../auth/session.php';
$_SESSION['started'] = true;
require_once __DIR__ . '/db.php';

if (!isset($_SESSION['user_id'])) {
    header("Location: ../auth/login.php");
    exit;
}

$user_name = isset($_SESSION['user_name']) ? $_SESSION['user_name'] : 'User';
$user_email = isset($_SESSION['user_email']) ? $_SESSION['user_email'] : '';
$customer_email = trim($_SESSION['customer_email'] ?? $user_email);
$customer = null;
if ($customer_email !== '') {
    $customer_query = $pdo->prepare('SELECT id, customer_name, email, phone, address, photo_path FROM customers WHERE email = ? LIMIT 1');
    $customer_query->execute([$customer_email]);
    $customer = $customer_query->fetch(PDO::FETCH_ASSOC) ?: null;
}
$is_existing_customer = $customer !== null;
$registration_message = $_SESSION['registration_message'] ?? null;
unset($_SESSION['registration_message']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Customer Profile | Dizon's Pet Grooming</title>
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
        <span class="fw-bold fs-5 text-success">Dizon's Pet Grooming</span>
    </div>
    
    <div class="dropdown">
        <a href="#" class="text-dark text-decoration-none dropdown-toggle hide-arrow" id="profileDropdown" data-bs-toggle="dropdown" aria-expanded="false">
            <i class="fa-regular fa-circle-user fs-3 text-success"></i>
        </a>
        <ul class="dropdown-menu dropdown-menu-end mt-2 p-3" aria-labelledby="profileDropdown">
            <li class="text-center mb-2">
                <i class="fa-solid fa-circle-user text-success fs-1 mb-2"></i>
                <h6 class="fw-bold text-dark mb-0"><?php echo htmlspecialchars($user_name); ?></h6>
                <small class="text-muted"><?php echo htmlspecialchars($user_email); ?></small>
                <small class="d-block text-muted mt-1">Your account</small>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li class="mb-2 text-center">
                <div class="text-secondary" style="font-size: 0.85rem;">
                </div>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
                <a class="dropdown-item text-danger fw-bold rounded-2 text-center py-2" href="../auth/logout.php">
                    <i class="fa-solid fa-right-from-bracket me-2"></i> Sign out
                </a>
            </li>
        </ul>
    </div>
</div>

<!-- SIDEBAR -->
<div class="sidebar">
    <a href="../auth/dashboard.php" class="nav-link"><i class="fa-solid fa-house"></i> Dashboard</a>
    <a href="#" class="nav-link text-muted opacity-50" onclick="alert('Complete your customer and pet profiles to browse products.'); return false;"><i class="fa-solid fa-box-archive"></i> Shop products</a>
    <a href="#" class="nav-link text-muted opacity-50" onclick="alert('Complete your customer and pet profiles to explore grooming services.'); return false;"><i class="fa-solid fa-scissors"></i> Grooming</a>
</div>

<!-- MAIN CONTENT -->
<div class="app-main-content">
    <?php if ($registration_message): ?>
        <div class="alert alert-success" role="status"><?php echo htmlspecialchars($registration_message); ?></div>
    <?php endif; ?>
    <div class="profile-card">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h4 class="fw-bold text-success mb-1"><?php echo $is_existing_customer ? 'Your customer profile' : 'Let’s set up your profile'; ?></h4>
                <p class="text-muted mb-0"><?php echo $is_existing_customer ? 'Keep your contact details up to date for a smoother shop and grooming experience.' : 'Add your contact details so we can prepare your pet-care visits and product reservations.'; ?></p>
            </div>
            <div>
                <?php if ($is_existing_customer): ?>
                    <button type="submit" form="customer-form" class="btn btn-custom btn-sm">Save changes</button>
                    <button type="button" id="edit-customer-button" class="btn btn-custom btn-sm">Edit profile</button>
                <?php endif; ?>
            </div>
        </div>

        <div class="row">
            <div class="col-md-4 mb-4 mb-md-0">
                <div class="left-avatar-box">
                    <div class="bg-white rounded-circle p-4 d-inline-block shadow-sm mb-3">
                        <img id="customer-photo-preview" class="profile-photo-preview<?php echo $customer && $customer['photo_path'] ? '' : ' d-none'; ?>" src="<?php echo $customer && $customer['photo_path'] ? htmlspecialchars('photo.php?type=customer&id=' . (int) $customer['id']) : ''; ?>" alt="Customer photo preview">
                        <i class="fa-solid fa-user text-secondary<?php echo $customer && $customer['photo_path'] ? ' d-none' : ''; ?>" style="font-size: 5rem;"></i>
                    </div>
                    <div class="d-flex justify-content-center gap-3 mb-3 text-dark fs-5">
                        <label for="customer-photo" class="cursor-pointer" title="Choose a profile photo" aria-label="Choose a profile photo"><i class="fa-solid fa-image"></i></label>
                        <small class="text-muted align-self-center">Profile photo</small>
                    </div>
                    <div class="bg-success text-white py-2 px-4 rounded-pill fw-bold d-inline-block shadow-sm">
                        YOUR PROFILE
                    </div>
                </div>
            </div>

            <div class="col-md-8">
                <form id="customer-form" action="save_customer.php" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="customer_id" value="<?php echo (int)($customer['id'] ?? 0); ?>">
                    <input type="hidden" name="action" value="<?php echo $is_existing_customer ? 'update' : 'create'; ?>">
                    <input type="file" id="customer-photo" name="customer_photo" accept="image/jpeg,image/png,image/gif,image/webp" capture="user" class="visually-hidden"<?php echo $is_existing_customer ? ' disabled' : ''; ?>>
                    <h5 class="fw-bold text-secondary mb-3">Contact information</h5>
                    
                    <div class="mb-3 row align-items-center">
                        <label for="customer-fullname" class="col-sm-3 fw-bold text-success">Full name</label>
                        <div class="col-sm-9">
                            <input id="customer-fullname" type="text" name="fullname" class="form-control" placeholder="Enter your first and last name" autocomplete="name" value="<?php echo htmlspecialchars($customer['customer_name'] ?? ''); ?>" required<?php echo $is_existing_customer ? ' readonly' : ''; ?>>
                        </div>
                    </div>
                    <div class="mb-3 row align-items-center">
                        <label for="customer-address" class="col-sm-3 fw-bold text-success">Complete address</label>
                        <div class="col-sm-9">
                            <input id="customer-address" type="text" name="address" class="form-control" placeholder="House or unit, street, barangay, city, province" autocomplete="street-address" value="<?php echo htmlspecialchars($customer['address'] ?? ''); ?>" required<?php echo $is_existing_customer ? ' readonly' : ''; ?>>
                        </div>
                    </div>

                    <div class="mb-4 row align-items-center">
                        <label for="customer-number" class="col-sm-3 fw-bold text-success">Mobile number</label>
                        <div class="col-sm-9">
                            <input id="customer-number" type="tel" name="number" class="form-control" inputmode="tel" autocomplete="tel" pattern="(?:\+63|0)9[0-9]{9}" placeholder="09XXXXXXXXX" aria-describedby="customer-number-help" value="<?php echo htmlspecialchars($customer['phone'] ?? ''); ?>" required<?php echo $is_existing_customer ? ' readonly' : ''; ?>>
                            <small id="customer-number-help" class="form-text text-muted">Enter a Philippine mobile number, such as 09171234567.</small>
                        </div>
                    </div>

                    <div class="d-flex justify-content-center">
                        <?php if (!$is_existing_customer): ?>
                            <button type="submit" class="btn btn-success rounded-pill px-4 fw-bold">Save and continue</button>
                        <?php endif; ?>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script>
// Preview the selected customer photo before the form is submitted.
document.getElementById('customer-photo').addEventListener('change', function () {
    const preview = document.getElementById('customer-photo-preview');
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

const editCustomerButton = document.getElementById('edit-customer-button');
if (editCustomerButton) {
    editCustomerButton.addEventListener('click', function () {
        const form = document.getElementById('customer-form');
        const fields = form.querySelectorAll('input[name="fullname"], input[name="address"], input[name="number"]');
        const photoInput = document.getElementById('customer-photo');
        const isEditing = this.dataset.editing !== 'true';

        fields.forEach(function (field) {
            field.readOnly = !isEditing;
        });
        photoInput.disabled = !isEditing;
        this.dataset.editing = String(isEditing);
        this.textContent = isEditing ? 'Finish editing' : 'Edit profile';
    });
}
</script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>