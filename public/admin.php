<?php
require_once __DIR__ . '/../auth/session.php';
require_once __DIR__ . '/db.php';

$adminRole = strtolower(trim($_SESSION['role'] ?? ''));
if (empty($_SESSION['user_id']) || !in_array($adminRole, ['admin', 'superadmin'], true)) {
    header('Location: ../auth/login.php');
    exit;
}

$_SESSION['admin_csrf'] ??= bin2hex(random_bytes(32));
$message = $_SESSION['admin_message'] ?? null;
unset($_SESSION['admin_message']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = $_POST['csrf_token'] ?? '';
    $action = $_POST['action'] ?? '';
    try {
        if (!is_string($csrf) || !hash_equals($_SESSION['admin_csrf'], $csrf)) {
            throw new RuntimeException('Your admin session expired. Please try again.');
        }
        if ($action === 'client_status') {
            $id = filter_var($_POST['user_id'] ?? null, FILTER_VALIDATE_INT);
            $status = $_POST['account_status'] ?? '';
            if (!$id || !in_array($status, ['Active', 'Suspended'], true) || $id === (int) $_SESSION['user_id']) throw new RuntimeException('Invalid client update.');
            $stmt = $pdo->prepare("UPDATE users SET account_status=? WHERE id=? AND LOWER(role) = 'user'");
            $stmt->execute([$status, $id]);
            $notice = 'Client account status updated.';
        } elseif ($action === 'product_update') {
            $id = filter_var($_POST['product_id'] ?? null, FILTER_VALIDATE_INT);
            $price = filter_var($_POST['price'] ?? null, FILTER_VALIDATE_FLOAT);
            $stock = filter_var($_POST['stock_quantity'] ?? null, FILTER_VALIDATE_INT);
            $previousStock = filter_var($_POST['previous_stock'] ?? null, FILTER_VALIDATE_INT);
            $previousPrice = filter_var($_POST['previous_price'] ?? null, FILTER_VALIDATE_FLOAT);
            if (!$id || $price === false || $price < 0 || $price > 99999999.99 || !preg_match('/^\d+(?:\.\d{1,2})?$/', trim($_POST['price'] ?? '')) || $stock === false || $stock < 0 || $stock > 2147483647 || $previousStock === false || $previousPrice === false) throw new RuntimeException('Enter a valid price and non-negative whole inventory quantity.');
            $stmt = $pdo->prepare('UPDATE products SET price=?, stock_quantity=? WHERE product_id=? AND stock_quantity=? AND price=?');
            $stmt->execute([$price, $stock, $id, $previousStock, $previousPrice]);
            if (!$stmt->rowCount()) {
                $check = $pdo->prepare('SELECT price, stock_quantity FROM products WHERE product_id=?');
                $check->execute([$id]); $current = $check->fetch(PDO::FETCH_ASSOC);
                if (!$current || (float)$current['price'] !== (float)$price || (int)$current['stock_quantity'] !== (int)$stock) throw new RuntimeException('Inventory changed. Refresh inventory before saving.');
            }
            $notice = 'Product price and available quantity updated.';
        } elseif ($action === 'product_add') {
            $sku = strtoupper(trim($_POST['sku'] ?? ''));
            $name = trim($_POST['product_name'] ?? '');
            $category = trim($_POST['category'] ?? '');
            $group = stripos($name, 'shampoo') !== false ? 'Shampoo' : (stripos($category, 'food') !== false ? 'Food' : 'Other');
            $price = filter_var($_POST['price'] ?? null, FILTER_VALIDATE_FLOAT);
            $stock = filter_var($_POST['stock_quantity'] ?? null, FILTER_VALIDATE_INT);
            if ($sku === '' || $name === '' || $category === '' || $price === false || $price < 0 || $stock === false || $stock < 0) throw new RuntimeException('Complete all required product fields.');
            $stmt = $pdo->prepare('INSERT INTO products (sku,product_name,category,product_group,price,stock_quantity,reorder_level,description,is_active) VALUES (?,?,?,?,?,?,?,?,1)');
            $stmt->execute([$sku, $name, $category, $group, $price, $stock, max(0, (int) ($_POST['reorder_level'] ?? 5)), trim($_POST['description'] ?? '')]);
            $notice = 'New product added to the catalog.';
        } elseif ($action === 'package_update') {
            $id = filter_var($_POST['pricing_id'] ?? null, FILTER_VALIDATE_INT);
            $price = filter_var($_POST['price'] ?? null, FILTER_VALIDATE_FLOAT);
            if (!$id || $price === false || $price < 0) throw new RuntimeException('Enter a valid package price.');
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('UPDATE style_size_pricing SET price=? WHERE pricing_id=?');
            $stmt->execute([$price, $id]);
            $styleStmt = $pdo->prepare('UPDATE grooming_styles gs INNER JOIN style_size_pricing sp ON sp.style_id=gs.style_id SET gs.style_name=? WHERE sp.pricing_id=?');
            $styleStmt->execute([trim($_POST['style_name'] ?? ''), $id]);
            $pdo->commit();
            $notice = 'Grooming package and price updated.';
        } elseif ($action === 'addon_update') {
            $id = filter_var($_POST['addon_id'] ?? null, FILTER_VALIDATE_INT);
            $price = filter_var($_POST['price'] ?? null, FILTER_VALIDATE_FLOAT);
            if (!$id || $price === false || $price < 0) throw new RuntimeException('Enter a valid add-on price.');
            $stmt = $pdo->prepare('UPDATE grooming_addons SET addon_name=?, price=? WHERE addon_id=?');
            $stmt->execute([trim($_POST['addon_name'] ?? ''), $price, $id]);
            $notice = 'Grooming add-on updated.';
        } elseif ($action === 'appointment_status') {
            $id = filter_var($_POST['appointment_id'] ?? null, FILTER_VALIDATE_INT);
            $status = $_POST['status'] ?? '';
            if (!$id || !in_array($status, ['Pending','Confirmed','Completed','Cancelled'], true)) throw new RuntimeException('Invalid appointment update.');
            $pdo->beginTransaction();
            $lock = $pdo->prepare('SELECT status FROM grooming_appointments WHERE appointment_id=? FOR UPDATE');
            $lock->execute([$id]);
            $previous = $lock->fetchColumn();
            $transitions = ['Pending'=>['Pending','Confirmed','Cancelled'], 'Confirmed'=>['Confirmed','Completed','Cancelled'], 'Completed'=>['Completed'], 'Cancelled'=>['Cancelled']];
            if (!$previous || !in_array($status, $transitions[$previous] ?? [], true)) throw new RuntimeException('This appointment status change is not permitted.');
            $stmt = $pdo->prepare("UPDATE grooming_appointments SET status=?, cancelled_at=IF(?='Cancelled',NOW(),NULL) WHERE appointment_id=?");
            $stmt->execute([$status, $status, $id]);
            if ($previous !== $status) {
                if ($status === 'Completed') {
                    $customerStmt = $pdo->prepare('SELECT customer_id FROM grooming_appointments WHERE appointment_id=?');
                    $customerStmt->execute([$id]);
                    $loyaltyCustomerId = (int)$customerStmt->fetchColumn();
                    $balanceStmt = $pdo->prepare('SELECT loyalty_stamps FROM customers WHERE id=? FOR UPDATE');
                    $balanceStmt->execute([$loyaltyCustomerId]);
                    $oldBalance = (int)$balanceStmt->fetchColumn();
                    $seed = $pdo->prepare("INSERT IGNORE INTO customer_loyalty_program(customer_id,completed_visits,vip_member) SELECT c.id,GREATEST(c.loyalty_stamps,(SELECT COUNT(*) FROM grooming_appointments a WHERE a.customer_id=c.id AND a.status='Completed' AND a.appointment_id<>?)),GREATEST(c.loyalty_stamps,(SELECT COUNT(*) FROM grooming_appointments a WHERE a.customer_id=c.id AND a.status='Completed' AND a.appointment_id<>?))>=11 FROM customers c WHERE c.id=?");
                    $seed->execute([$id,$id,$loyaltyCustomerId]);
                    $programStmt=$pdo->prepare('SELECT completed_visits,vip_member FROM customer_loyalty_program WHERE customer_id=? FOR UPDATE');
                    $programStmt->execute([$loyaltyCustomerId]);$program=$programStmt->fetch(PDO::FETCH_ASSOC);
                    $newBalance=(int)$program['completed_visits']+1;
                    $isVip=(bool)$program['vip_member'] || $newBalance>=11;
                    $discountPercent=$isVip?10:(in_array($newBalance,[5,10],true)?50:0);
                    $pricingSeed=$pdo->prepare('INSERT IGNORE INTO appointment_loyalty_pricing(appointment_id,subtotal) SELECT appointment_id,total_price FROM grooming_appointments WHERE appointment_id=?');$pricingSeed->execute([$id]);
                    $pricingStmt=$pdo->prepare('SELECT subtotal FROM appointment_loyalty_pricing WHERE appointment_id=? FOR UPDATE');$pricingStmt->execute([$id]);
                    $subtotalCents=(int)round((float)$pricingStmt->fetchColumn()*100);$discountCents=$subtotalCents-(int)round($subtotalCents*(100-$discountPercent)/100);
                    $invoiceUpdate=$pdo->prepare('UPDATE grooming_appointments SET total_price=? WHERE appointment_id=?');$invoiceUpdate->execute([($subtotalCents-$discountCents)/100,$id]);
                    $pricingUpdate=$pdo->prepare('UPDATE appointment_loyalty_pricing SET discount_percent=?,discount_amount=?,visit_number=?,applied_at=UTC_TIMESTAMP(3) WHERE appointment_id=?');$pricingUpdate->execute([$discountPercent,$discountCents/100,$newBalance,$id]);
                    $programUpdate=$pdo->prepare('UPDATE customer_loyalty_program SET completed_visits=?,vip_member=?,vip_since=IF(?,COALESCE(vip_since,UTC_TIMESTAMP(3)),vip_since) WHERE customer_id=?');$programUpdate->execute([$newBalance,$isVip?1:0,$isVip?1:0,$loyaltyCustomerId]);
                    $balanceUpdate = $pdo->prepare('UPDATE customers SET loyalty_stamps=?, reward_available=? WHERE id=?');
                    $balanceUpdate->execute([$newBalance, $isVip ? 1 : 0, $loyaltyCustomerId]);
                    $ledger = $pdo->prepare('INSERT INTO loyalty_transactions(customer_id,changed_by_id,change_amount,balance_after,reason) VALUES(?,?,?,?,?)');
                    $ledger->execute([$loyaltyCustomerId,(int)$_SESSION['user_id'],1,$newBalance,'Completed grooming appointment '.$id.'; visit '.$newBalance.'; '.$discountPercent.'% discount']);
                    notifyLegacyEvent($pdo,$loyaltyCustomerId,'appointment.loyalty.'.$id,$newBalance===11?'Lifetime VIP unlocked':'Loyalty stamp earned','Completed visit '.$newBalance.'. '.$discountPercent.'% service discount applied. '.($isVip?'Lifetime VIP: 10% off services.':''),'loyalty',$id);
                }
                $owner = $pdo->prepare('SELECT customer_id FROM grooming_appointments WHERE appointment_id=?');
                $owner->execute([$id]);
                notifyLegacyEvent($pdo, (int) $owner->fetchColumn(), 'appointment.status.' . $id . '.' . $status, 'Grooming appointment updated', 'Appointment status is now ' . $status . '.', 'appointment', $id);
            }
            $pdo->commit();
            $notice = 'Appointment status updated.';
        } elseif ($action === 'product_reservation_status') {
            $id = filter_var($_POST['reservation_id'] ?? null, FILTER_VALIDATE_INT);
            $status = $_POST['status'] ?? '';
            if (!$id || !in_array($status, ['Pending','Approved','Ready for Pickup','Completed','Cancelled'], true)) throw new RuntimeException('Invalid reservation update.');
            $pdo->beginTransaction();
            $lock = $pdo->prepare('SELECT status FROM product_reservations WHERE reservation_id=? FOR UPDATE');
            $lock->execute([$id]);
            $currentStatus = $lock->fetchColumn();
            $transitions = ['Pending' => ['Pending','Approved','Cancelled'], 'Approved' => ['Approved','Ready for Pickup','Cancelled'], 'Ready for Pickup' => ['Ready for Pickup','Completed','Cancelled'], 'Completed' => ['Completed'], 'Cancelled' => ['Cancelled']];
            if (!$currentStatus || !in_array($status, $transitions[$currentStatus] ?? [], true)) throw new RuntimeException('This status change is not permitted.');
            if ($status === 'Cancelled' && $currentStatus !== 'Cancelled') {
                $restore = $pdo->prepare('UPDATE products p INNER JOIN product_reservation_items i ON i.product_id=p.product_id SET p.stock_quantity=p.stock_quantity+i.quantity WHERE i.reservation_id=?');
                $restore->execute([$id]);
            }
            $stmt = $pdo->prepare('UPDATE product_reservations SET status=? WHERE reservation_id=?');
            $stmt->execute([$status, $id]);
            if ($currentStatus !== $status) {
                $owner = $pdo->prepare('SELECT customer_id FROM product_reservations WHERE reservation_id=?');
                $owner->execute([$id]);
                notifyLegacyEvent($pdo, (int) $owner->fetchColumn(), 'product-reservation.status.' . $id . '.' . $status, 'Product reservation updated', 'Reservation status is now ' . $status . '.', 'product_reservation', $id);
            }
            $pdo->commit();
            $notice = 'Product reservation status updated.';
        } else {
            throw new RuntimeException('Unknown admin action.');
        }
        $_SESSION['admin_message'] = ['type' => 'success', 'text' => $notice];
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $_SESSION['admin_message'] = ['type' => 'error', 'text' => $exception instanceof PDOException && $exception->getCode() === '23000' ? 'That SKU already exists.' : $exception->getMessage()];
    }
    $section = preg_replace('/[^a-z_]/', '', $_POST['return_section'] ?? 'overview');
    header('Location: admin.php#' . $section);
    exit;
}

$stats = $pdo->query("SELECT (SELECT COUNT(*) FROM users WHERE LOWER(role)='user') clients,(SELECT COUNT(*) FROM products WHERE is_active=1) products,(SELECT COUNT(*) FROM products WHERE is_active=1 AND stock_quantity<=reorder_level) low_stock,(SELECT COUNT(*) FROM grooming_appointments WHERE status IN ('Pending','Confirmed','Checked In','In Progress')) appointments")->fetch(PDO::FETCH_ASSOC);
$clients = $pdo->query("SELECT u.id,u.first_name,u.surname,u.email,u.phone_number,u.account_status,u.created_at,c.id customer_id,(SELECT COUNT(*) FROM pets p WHERE p.customer_id=c.id) pet_count FROM users u LEFT JOIN customers c ON c.email=u.email WHERE LOWER(u.role)='user' ORDER BY u.created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
$products = $pdo->query('SELECT * FROM products ORDER BY is_active DESC, category, product_name')->fetchAll(PDO::FETCH_ASSOC);
$prices = $pdo->query('SELECT sp.pricing_id,gs.style_id,gs.style_name,sp.pet_size,sp.price FROM style_size_pricing sp INNER JOIN grooming_styles gs ON gs.style_id=sp.style_id ORDER BY gs.style_id,FIELD(sp.pet_size,\'Small\',\'Medium\',\'Large\',\'Extra Large\',\'Giant\')')->fetchAll(PDO::FETCH_ASSOC);
$addons = $pdo->query('SELECT * FROM grooming_addons ORDER BY addon_name')->fetchAll(PDO::FETCH_ASSOC);
$appointments = $pdo->query("SELECT a.appointment_id,a.reservation_code,a.appointment_date,a.appointment_time,a.status,c.customer_name,p.pet_name,s.style_name FROM grooming_appointments a INNER JOIN customers c ON c.id=a.customer_id INNER JOIN pets p ON p.id=a.pet_id INNER JOIN grooming_styles s ON s.style_id=a.grooming_style_id ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 30")->fetchAll(PDO::FETCH_ASSOC);
$productReservations = $pdo->query("SELECT r.reservation_id,r.reservation_code,r.status,r.total_amount,r.created_at,c.customer_name,GROUP_CONCAT(CONCAT(p.product_name,' × ',i.quantity) SEPARATOR ', ') items FROM product_reservations r INNER JOIN customers c ON c.id=r.customer_id INNER JOIN product_reservation_items i ON i.reservation_id=r.reservation_id INNER JOIN products p ON p.product_id=i.product_id GROUP BY r.reservation_id ORDER BY r.created_at DESC LIMIT 30")->fetchAll(PDO::FETCH_ASSOC);
$adminName = $_SESSION['customer_name'] ?? 'Administrator';
?>
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Center - DIZON'S Pet Grooming</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"><link rel="stylesheet" href="../css/style.css"></head>
<body class="admin-page"><aside class="admin-sidebar"><div class="admin-brand"><img src="../images/cutoutlogo.png" alt="DIZON'S Pet Grooming"><div><strong>DIZON'S</strong><small>Admin Center</small></div></div><nav><a href="#overview" class="active"><i class="fa-solid fa-grid-2"></i>Overview</a><a href="#clients"><i class="fa-solid fa-users"></i>Clients</a><a href="#inventory"><i class="fa-solid fa-boxes-stacked"></i>Inventory</a><a href="#grooming"><i class="fa-solid fa-scissors"></i>Packages & Prices</a><a href="#operations"><i class="fa-solid fa-calendar-check"></i>Reservations</a><?php if ($adminRole === 'superadmin'): ?><a href="superadmin.php"><i class="fa-solid fa-shield-halved"></i>Super Admin</a><?php endif; ?></nav><a href="../auth/logout.php" class="admin-logout"><i class="fa-solid fa-right-from-bracket"></i>Logout</a></aside>
<main class="admin-main"><header class="admin-topbar"><button id="adminMenu"><i class="fa-solid fa-bars"></i></button><div><small>Signed in as</small><strong><?= htmlspecialchars($adminName) ?></strong></div></header>
<?php if ($message): ?><div class="premium-notice <?= $message['type'] ?> admin-notice"><?= htmlspecialchars($message['text']) ?></div><?php endif; ?>
<section id="overview" class="admin-section"><div class="admin-heading"><div><span>System overview</span><h1>Good operations start here.</h1><p>Monitor clients, inventory, pricing, and reservations from one workspace.</p></div></div><div class="admin-stat-grid"><article><i class="fa-solid fa-users"></i><span>Client accounts</span><strong><?= (int)$stats['clients'] ?></strong><a href="#clients">Manage clients</a></article><article><i class="fa-solid fa-box-open"></i><span>Active products</span><strong><?= (int)$stats['products'] ?></strong><a href="#inventory">Open inventory</a></article><article class="warning"><i class="fa-solid fa-triangle-exclamation"></i><span>Low stock</span><strong><?= (int)$stats['low_stock'] ?></strong><a href="#inventory">Restock now</a></article><article><i class="fa-solid fa-calendar-days"></i><span>Active appointments</span><strong><?= (int)$stats['appointments'] ?></strong><a href="#operations">View schedule</a></article></div></section>

<section id="clients" class="admin-section"><div class="admin-heading"><div><span>Client management</span><h2>Accounts and access</h2><p>Review verified clients, registration details, pets, and account access.</p></div></div><div class="admin-table-wrap"><table><thead><tr><th>Client</th><th>Contact</th><th>Pets</th><th>Joined</th><th>Access</th></tr></thead><tbody><?php foreach($clients as $client): ?><tr><td><strong><?= htmlspecialchars(trim(($client['first_name']??'').' '.($client['surname']??'')) ?: 'Customer') ?></strong><small><?= htmlspecialchars($client['email']) ?></small></td><td><?= htmlspecialchars($client['phone_number'] ?: 'Not provided') ?></td><td><?= (int)$client['pet_count'] ?></td><td><?= date('M d, Y',databaseTimestamp($client['created_at'])) ?></td><td><form method="POST" class="inline-admin-form"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>"><input type="hidden" name="action" value="client_status"><input type="hidden" name="return_section" value="clients"><input type="hidden" name="user_id" value="<?= (int)$client['id'] ?>"><select name="account_status"><option <?= $client['account_status']==='Active'?'selected':'' ?>>Active</option><option <?= $client['account_status']==='Suspended'?'selected':'' ?>>Suspended</option></select><button>Save</button></form></td></tr><?php endforeach; ?></tbody></table></div></section>

<section id="inventory" class="admin-section"><div class="admin-heading split"><div><span>Inventory control</span><h2>Products and quantity</h2><p>Update selling prices and available stock. Product details remain read-only.</p></div><button class="admin-primary-button" data-bs-toggle="modal" data-bs-target="#addProductModal"><i class="fa-solid fa-plus"></i>Add product</button></div><div class="admin-product-grid"><?php foreach($products as $product): ?><form method="POST" class="admin-product-card <?= (int)$product['stock_quantity'] <= (int)$product['reorder_level'] ? 'low-stock':'' ?>"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>"><input type="hidden" name="action" value="product_update"><input type="hidden" name="return_section" value="inventory"><input type="hidden" name="product_id" value="<?= (int)$product['product_id'] ?>"><input type="hidden" name="previous_stock" value="<?= (int)$product['stock_quantity'] ?>"><input type="hidden" name="previous_price" value="<?= htmlspecialchars($product['price']) ?>"><div class="admin-product-card-head"><small><?= htmlspecialchars($product['sku']) ?></small><span><?= (int)$product['stock_quantity'] <= (int)$product['reorder_level'] ? 'Low stock':'In stock' ?></span></div><input readonly name="product_name" value="<?= htmlspecialchars($product['product_name']) ?>" aria-label="Product name"><input readonly name="category" value="<?= htmlspecialchars($product['category']) ?>" aria-label="Category"><div class="admin-field-row"><label>Price<input type="number" step="0.01" min="0" name="price" value="<?= htmlspecialchars($product['price']) ?>"></label><label>Quantity<input type="number" min="0" name="stock_quantity" value="<?= (int)$product['stock_quantity'] ?>"></label><label>Alert at<input type="number" min="0" readonly name="reorder_level" value="<?= (int)$product['reorder_level'] ?>"></label></div><div class="admin-card-footer"><label class="admin-check"><input type="checkbox" disabled name="is_active" <?= $product['is_active']?'checked':'' ?>>Visible</label><button>Update</button></div></form><?php endforeach; ?></div></section>

<section id="grooming" class="admin-section"><div class="admin-heading"><div><span>Service catalog</span><h2>Packages and prices</h2><p>Maintain package names and pricing by pet size.</p></div></div><div class="admin-pricing-layout"><div class="admin-table-wrap"><table><thead><tr><th>Package</th><th>Pet size</th><th>Edit name and price</th></tr></thead><tbody><?php foreach($prices as $price): ?><tr><td><strong><?= htmlspecialchars($price['style_name']) ?></strong></td><td><?= htmlspecialchars($price['pet_size']) ?></td><td><form method="POST" class="inline-admin-form"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>"><input type="hidden" name="action" value="package_update"><input type="hidden" name="return_section" value="grooming"><input type="hidden" name="pricing_id" value="<?= (int)$price['pricing_id'] ?>"><input name="style_name" value="<?= htmlspecialchars($price['style_name']) ?>" aria-label="Package name"><input type="number" step="0.01" min="0" name="price" value="<?= htmlspecialchars($price['price']) ?>" aria-label="Price"><button>Save</button></form></td></tr><?php endforeach; ?></tbody></table></div><div class="admin-addon-list"><h3>Add-on services</h3><?php foreach($addons as $addon): ?><form method="POST"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>"><input type="hidden" name="action" value="addon_update"><input type="hidden" name="return_section" value="grooming"><input type="hidden" name="addon_id" value="<?= (int)$addon['addon_id'] ?>"><input name="addon_name" value="<?= htmlspecialchars($addon['addon_name']) ?>"><input type="number" name="price" step="0.01" min="0" value="<?= htmlspecialchars($addon['price']) ?>"><button>Update</button></form><?php endforeach; ?></div></div></section>

<section id="operations" class="admin-section"><div class="admin-heading"><div><span>Daily operations</span><h2>Reservation management</h2><p>Confirm appointments and prepare reserved products for pickup.</p></div></div><div class="admin-operations-grid"><div class="admin-table-wrap"><h3>Grooming</h3><table><thead><tr><th>Reference</th><th>Client / Pet</th><th>Schedule</th><th>Status</th></tr></thead><tbody><?php foreach($appointments as $item): ?><tr><td><strong><?= htmlspecialchars($item['reservation_code']) ?></strong><small><?= htmlspecialchars($item['style_name']) ?></small></td><td><?= htmlspecialchars($item['customer_name']) ?><small><?= htmlspecialchars($item['pet_name']) ?></small></td><td><?= date('M d, Y',strtotime($item['appointment_date'])) ?><small><?= date('g:i A',strtotime($item['appointment_time'])) ?></small></td><td><form method="POST" class="inline-admin-form"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>"><input type="hidden" name="action" value="appointment_status"><input type="hidden" name="return_section" value="operations"><input type="hidden" name="appointment_id" value="<?= (int)$item['appointment_id'] ?>"><select name="status"><?php foreach(['Pending','Confirmed','Completed','Cancelled'] as $status): ?><option <?= $item['status']===$status?'selected':'' ?>><?= $status ?></option><?php endforeach; ?></select><button>Save</button></form></td></tr><?php endforeach; ?></tbody></table></div><div class="admin-table-wrap"><h3>Product pickup</h3><table><thead><tr><th>Reference</th><th>Client / Items</th><th>Total</th><th>Status</th></tr></thead><tbody><?php foreach($productReservations as $item): ?><tr><td><strong><?= htmlspecialchars($item['reservation_code']) ?></strong><small><?= date('M d, g:i A',databaseTimestamp($item['created_at'])) ?></small></td><td><?= htmlspecialchars($item['customer_name']) ?><small><?= htmlspecialchars($item['items']) ?></small></td><td>PHP <?= number_format((float)$item['total_amount'],2) ?></td><td><form method="POST" class="inline-admin-form"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>"><input type="hidden" name="action" value="product_reservation_status"><input type="hidden" name="return_section" value="operations"><input type="hidden" name="reservation_id" value="<?= (int)$item['reservation_id'] ?>"><select name="status"><?php foreach(['Pending','Approved','Ready for Pickup','Completed','Cancelled'] as $status): ?><option <?= $item['status']===$status?'selected':'' ?>><?= $status ?></option><?php endforeach; ?></select><button <?= $item['status']==='Cancelled'?'disabled':'' ?>>Save</button></form></td></tr><?php endforeach; ?></tbody></table></div></div></section>
</main>
<div class="modal fade" id="addProductModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><form method="POST" class="modal-content admin-modal"><div class="modal-header"><h2>Add inventory product</h2><button class="btn-close" data-bs-dismiss="modal" type="button"></button></div><div class="modal-body"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['admin_csrf']) ?>"><input type="hidden" name="action" value="product_add"><input type="hidden" name="return_section" value="inventory"><label>SKU<input name="sku" required placeholder="DOG-CARE-002"></label><label>Product name<input name="product_name" required></label><label>Category<input name="category" required placeholder="Dog Care"></label><label>Description<textarea name="description" rows="3"></textarea></label><div class="admin-field-row"><label>Price<input type="number" name="price" step="0.01" min="0" required></label><label>Quantity<input type="number" name="stock_quantity" min="0" required></label><label>Alert at<input type="number" name="reorder_level" min="0" value="5"></label></div></div><div class="modal-footer"><button type="button" class="admin-quiet-button" data-bs-dismiss="modal">Cancel</button><button class="admin-primary-button">Add product</button></div></form></div></div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script><script>document.getElementById('adminMenu').addEventListener('click',()=>document.querySelector('.admin-sidebar').classList.toggle('open'));const links=[...document.querySelectorAll('.admin-sidebar nav a')];function activeNav(){let current=location.hash||'#overview';links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')===current));}window.addEventListener('hashchange',activeNav);activeNav();</script></body></html>