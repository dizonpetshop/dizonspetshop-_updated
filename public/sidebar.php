<?php
$activePage = $activePage ?? '';
$customerNavigation = [
    'dashboard' => ['dashboard.php', 'fa-house', 'Dashboard'],
    'products' => ['products.php', 'fa-box-archive', 'Products'],
    'product_reservations' => ['my_product_reservations.php', 'fa-bag-shopping', 'Product Reservations'],
    'grooming' => ['grooming.php', 'fa-scissors', 'Grooming'],
    'reservations' => ['my_appointments.php', 'fa-calendar-check', 'My Reservations'],
];
?>
<!-- Shared sidebar navigation -->
<div class="sidebar">
    <?php foreach ($customerNavigation as $pageKey => [$href, $icon, $label]): ?>
        <a href="<?= $href ?>" class="nav-link<?= $activePage === $pageKey ? ' active' : '' ?>">
            <i class="fa-solid <?= $icon ?>"></i> <?= $label ?>
        </a>
    <?php endforeach; ?>

    <?php if (isset($_SESSION['role']) && in_array(strtolower(trim($_SESSION['role'])), ['admin', 'superadmin'], true)): ?>
        <hr class="text-white-50 mx-3 my-2">
        <a href="admin.php" class="nav-link"><i class="fa-solid fa-gauge-high"></i> Admin Center</a>
    <?php endif; ?>
    <?php if (isset($_SESSION['role']) && strtolower(trim($_SESSION['role'])) === 'superadmin'): ?>
        <a href="superadmin.php" class="nav-link"><i class="fa-solid fa-shield-halved"></i> Super Admin Center</a>
    <?php endif; ?>
</div>
