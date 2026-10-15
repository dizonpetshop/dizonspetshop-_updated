<?php
require_once __DIR__ . '/../auth/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/customer_access.php';

if (empty($_SESSION['user_id'])) {
    header('Location: ../auth/login.php');
    exit;
}

if (!hasCompletedCustomerRegistration($pdo)) {
    header('Location: register_customer.php');
    exit;
}

$email = trim($_SESSION['customer_email'] ?? '');
$customerStmt = $pdo->prepare('SELECT * FROM customers WHERE email = ? LIMIT 1');
$customerStmt->execute([$email]);
$customer = $customerStmt->fetch(PDO::FETCH_ASSOC);

if (!$customer) {
    header('Location: register_customer.php');
    exit;
}

$_SESSION['customer_id'] = (int) $customer['id'];
$userName = $_SESSION['customer_name'] ?? $customer['customer_name'];

$petStmt = $pdo->prepare('SELECT id, pet_name, breed, species, photo_path FROM pets WHERE customer_id = ? AND is_active = 1 ORDER BY pet_name');
$petStmt->execute([$customer['id']]);
$pets = $petStmt->fetchAll(PDO::FETCH_ASSOC);

$styles = $pdo->query('SELECT style_id, style_name FROM grooming_styles ORDER BY style_name')->fetchAll(PDO::FETCH_ASSOC);
$pricingRows = $pdo->query('SELECT style_id, pet_size, price FROM style_size_pricing')->fetchAll(PDO::FETCH_ASSOC);
$addons = $pdo->query('SELECT addon_id, addon_name, price FROM grooming_addons ORDER BY addon_name')->fetchAll(PDO::FETCH_ASSOC);
$groomers = $pdo->query('SELECT groomer_id, groomer_name FROM groomers WHERE is_active = 1 ORDER BY groomer_name')->fetchAll(PDO::FETCH_ASSOC);

$pricing = [];
foreach ($pricingRows as $row) {
    $pricing[(int) $row['style_id']][$row['pet_size']] = (float) $row['price'];
}

function sendReservationConfirmation(string $to, array $booking): bool
{
    $safe = static fn($value) => htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    $message = '<!doctype html><html lang="en"><body style="margin:0;background:#edf5ff;font-family:Arial,sans-serif;color:#10214d;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 16px 40px rgba(16,33,77,.14);">'
        . '<tr><td style="padding:30px;text-align:center;background:linear-gradient(135deg,#10214d,#2f6edf);color:#fff;">'
        . '<div style="font-size:30px;">&#9986;</div><h1 style="margin:8px 0 4px;font-size:24px;">Reservation received</h1>'
        . '<p style="margin:0;color:#dbe7ff;">Reference ' . $safe($booking['reservation_code']) . '</p></td></tr>'
        . '<tr><td style="padding:30px;"><p style="margin-top:0;">Hello <strong>' . $safe($booking['customer_name']) . '</strong>,</p>'
        . '<p style="color:#5d6c84;line-height:1.6;">Your grooming reservation is pending confirmation. Here are the details:</p>'
        . '<table role="presentation" width="100%" cellpadding="8" style="background:#f5f8fd;border-radius:12px;">'
        . '<tr><td>Pet</td><td align="right"><strong>' . $safe($booking['pet_name']) . '</strong></td></tr>'
        . '<tr><td>Package</td><td align="right"><strong>' . $safe($booking['style_name']) . '</strong></td></tr>'
        . '<tr><td>Schedule</td><td align="right"><strong>' . $safe($booking['schedule']) . '</strong></td></tr>'
        . '<tr><td>Groomer</td><td align="right"><strong>' . $safe($booking['groomer_name']) . '</strong></td></tr>'
        . '<tr><td>Total</td><td align="right" style="color:#2f6edf;font-size:18px;"><strong>PHP ' . number_format((float) $booking['total_price'], 2) . '</strong></td></tr>'
        . '</table><p style="margin:24px 0 0;color:#7a879c;font-size:12px;text-align:center;">We will contact you if the schedule requires adjustment.</p>'
        . '</td></tr></table></td></tr></table></body></html>';

    return sendMail($to, 'Grooming Reservation ' . $booking['reservation_code'], $message, true);
}

$_SESSION['booking_csrf'] ??= generateToken();
$csrfToken = $_SESSION['booking_csrf'];
$error = '';
$errorStep = 1;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedCsrf = $_POST['csrf_token'] ?? '';
    $petId = filter_var($_POST['pet_id'] ?? null, FILTER_VALIDATE_INT);
    $styleId = filter_var($_POST['style_id'] ?? null, FILTER_VALIDATE_INT);
    $groomerId = filter_var($_POST['groomer_id'] ?? null, FILTER_VALIDATE_INT);
    $bookingType = $_POST['booking_type'] ?? '';
    $petSize = $_POST['pet_size'] ?? '';
    $appointmentDate = $_POST['appointment_date'] ?? '';
    $appointmentTime = $_POST['appointment_time'] ?? '';
    $instructions = trim($_POST['special_instructions'] ?? '');
    $selectedAddonIds = array_values(array_unique(array_filter(array_map('intval', (array) ($_POST['addon_ids'] ?? [])))));
    $allowedSizes = ['Small', 'Medium', 'Large', 'Extra Large', 'Giant'];
    $allowedTimes = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
    $selectedDate = DateTimeImmutable::createFromFormat('!Y-m-d', $appointmentDate);
    $today = new DateTimeImmutable('today');

    if (!is_string($submittedCsrf) || !hash_equals($csrfToken, $submittedCsrf)) {
        $error = 'Your booking session expired. Refresh the page and try again.';
    } elseif (!in_array($bookingType, ['Salon', 'Home Service'], true)) {
        $error = 'Choose salon grooming or home service.';
    } elseif (!$petId || !$styleId || !in_array($petSize, $allowedSizes, true)) {
        $error = 'Complete the pet and grooming package details.';
        $errorStep = !$petId ? 2 : 3;
    } elseif (!$selectedDate || $selectedDate->format('Y-m-d') !== $appointmentDate || $selectedDate < $today || $selectedDate > $today->modify('+90 days')) {
        $error = 'Choose a valid appointment date within the next 90 days.';
        $errorStep = 4;
    } elseif (!in_array($appointmentTime, $allowedTimes, true)) {
        $error = 'Choose an available appointment time.';
        $errorStep = 4;
    } elseif (new DateTimeImmutable($appointmentDate . ' ' . $appointmentTime) <= new DateTimeImmutable()) {
        $error = 'Choose a future appointment time.';
        $errorStep = 4;
    } elseif ($bookingType === 'Home Service' && trim((string) $customer['address']) === '') {
        $error = 'Add your address to your customer profile before selecting home service.';
    } else {
        $ownedPetStmt = $pdo->prepare('SELECT pet_name FROM pets WHERE id = ? AND customer_id = ? AND is_active = 1');
        $ownedPetStmt->execute([$petId, $customer['id']]);
        $petName = $ownedPetStmt->fetchColumn();
        $basePrice = $pricing[$styleId][$petSize] ?? null;

        if (!$petName || $basePrice === null) {
            $error = 'The selected pet or grooming package is invalid.';
            $errorStep = !$petName ? 2 : 3;
        } else {
            $addonRows = [];
            $addonTotal = 0.0;
            if ($selectedAddonIds) {
                $placeholders = implode(',', array_fill(0, count($selectedAddonIds), '?'));
                $addonStmt = $pdo->prepare("SELECT addon_id, addon_name, price FROM grooming_addons WHERE addon_id IN ($placeholders)");
                $addonStmt->execute($selectedAddonIds);
                $addonRows = $addonStmt->fetchAll(PDO::FETCH_ASSOC);
                if (count($addonRows) !== count($selectedAddonIds)) {
                    $error = 'One or more selected add-ons are unavailable.';
                    $errorStep = 3;
                }
                foreach ($addonRows as $addon) {
                    $addonTotal += (float) $addon['price'];
                }
            }

            if ($error === '') {
                $dayOfWeek = (int) $selectedDate->format('w');
                $candidateSql =
                    "SELECT g.groomer_id, g.groomer_name
                     FROM groomers g
                     INNER JOIN groomer_availability ga ON ga.groomer_id = g.groomer_id
                     WHERE g.is_active = 1 AND ga.is_active = 1
                       AND ga.day_of_week = ? AND ga.start_time <= ? AND ga.end_time > ?
                       AND NOT EXISTS (
                           SELECT 1 FROM grooming_appointments a
                           WHERE a.groomer_id = g.groomer_id AND a.appointment_date = ?
                             AND a.appointment_time = ? AND a.status <> 'Cancelled'
                       )";
                $candidateParams = [$dayOfWeek, $appointmentTime, $appointmentTime, $appointmentDate, $appointmentTime];
                if ($groomerId) {
                    $candidateSql .= ' AND g.groomer_id = ?';
                    $candidateParams[] = $groomerId;
                }
                $candidateSql .= ' ORDER BY g.groomer_id LIMIT 1';
                $candidateStmt = $pdo->prepare($candidateSql);
                $candidateStmt->execute($candidateParams);
                $assignedGroomer = $candidateStmt->fetch(PDO::FETCH_ASSOC);

                if (!$assignedGroomer) {
                    $error = 'That time is no longer available. Please choose another time or groomer.';
                    $errorStep = 4;
                } else {
                    $reservationCode = 'DPG-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
                    $totalPrice = (float) $basePrice + $addonTotal;
                    $serviceAddress = $bookingType === 'Home Service' ? $customer['address'] : null;

                    try {
                        $pdo->beginTransaction();
                        $groomerLock = $pdo->prepare('SELECT groomer_id FROM groomers WHERE groomer_id = ? AND is_active = 1 FOR UPDATE');
                        $groomerLock->execute([$assignedGroomer['groomer_id']]);
                        if (!$groomerLock->fetchColumn()) throw new RuntimeException('This groomer is no longer available.');
                        $petLock = $pdo->prepare('SELECT id FROM pets WHERE id = ? AND customer_id = ? AND is_active = 1 FOR UPDATE');
                        $petLock->execute([$petId, $customer['id']]);
                        if (!$petLock->fetchColumn()) throw new RuntimeException('This pet is no longer available.');
                        $slotCheck = $pdo->prepare("SELECT appointment_id FROM grooming_appointments WHERE appointment_date = ? AND (groomer_id = ? OR pet_id = ?) AND status IN ('Pending','Confirmed','Checked In','In Progress') AND ABS(TIME_TO_SEC(appointment_time) - TIME_TO_SEC(?)) < 3600 LIMIT 1 FOR UPDATE");
                        $slotCheck->execute([$appointmentDate, $assignedGroomer['groomer_id'], $petId, $appointmentTime]);
                        if ($slotCheck->fetchColumn()) throw new RuntimeException('The groomer or pet already has an appointment within this time slot.');
                        $insert = $pdo->prepare(
                            "INSERT INTO grooming_appointments
                                (reservation_code, customer_id, pet_id, grooming_style_id, groomer_id, booking_type,
                                 service_address, pet_size, appointment_date, appointment_time, special_instructions, total_price)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                        );
                        $insert->execute([
                            $reservationCode, $customer['id'], $petId, $styleId, $assignedGroomer['groomer_id'],
                            $bookingType, $serviceAddress, $petSize, $appointmentDate, $appointmentTime,
                            $instructions !== '' ? $instructions : null, $totalPrice,
                        ]);
                        $appointmentId = (int) $pdo->lastInsertId();
                        $loyaltyQuery = $pdo->prepare('SELECT completed_visits, vip_member FROM customer_loyalty_program WHERE customer_id = ?');
                        $loyaltyQuery->execute([(int) $customer['id']]);
                        $loyalty = $loyaltyQuery->fetch(PDO::FETCH_ASSOC);
                        $nextVisit = (int) ($loyalty['completed_visits'] ?? 0) + 1;
                        $estimatedPercent = !empty($loyalty['vip_member']) || $nextVisit >= 11 ? 10 : (in_array($nextVisit, [5, 10], true) ? 50 : 0);
                        $loyaltyQuote = $pdo->prepare('INSERT INTO appointment_loyalty_pricing (appointment_id, subtotal, estimated_percent) VALUES (?, ?, ?)');
                        $loyaltyQuote->execute([$appointmentId, $totalPrice, $estimatedPercent]);

                        if ($addonRows) {
                            $addonInsert = $pdo->prepare('INSERT INTO appointment_addons (appointment_id, addon_id, price_at_booking) VALUES (?, ?, ?)');
                            foreach ($addonRows as $addon) {
                                $addonInsert->execute([$appointmentId, $addon['addon_id'], $addon['price']]);
                            }
                        }
                        notifyLegacyEvent($pdo, (int) $customer['id'], 'appointment.created.' . $appointmentId, 'Grooming request received', 'Grooming reservation ' . $reservationCode . ' is pending review.', 'appointment', $appointmentId);
                        $pdo->commit();

                        $styleName = '';
                        foreach ($styles as $style) {
                            if ((int) $style['style_id'] === $styleId) {
                                $styleName = $style['style_name'];
                                break;
                            }
                        }
                        $emailSent = sendReservationConfirmation($email, [
                            'reservation_code' => $reservationCode,
                            'customer_name' => $customer['customer_name'],
                            'pet_name' => $petName,
                            'style_name' => $styleName,
                            'schedule' => $selectedDate->format('F j, Y') . ' at ' . date('g:i A', strtotime($appointmentTime)),
                            'groomer_name' => $assignedGroomer['groomer_name'],
                            'total_price' => $totalPrice,
                        ]);
                        if ($emailSent) {
                            $mailUpdate = $pdo->prepare('UPDATE grooming_appointments SET confirmation_email_sent_at = NOW() WHERE appointment_id = ?');
                            $mailUpdate->execute([$appointmentId]);
                        }
                        header('Location: book_grooming.php?confirmed=' . rawurlencode($reservationCode));
                        exit;
                    } catch (PDOException $exception) {
                        if ($pdo->inTransaction()) {
                            $pdo->rollBack();
                        }
                        error_log('Grooming reservation error: ' . $exception->getMessage());
                        $error = (string) $exception->getCode() === '23000'
                            ? 'That schedule was just reserved. Please select another time.'
                            : 'We could not save the reservation. Please try again.';
                        $errorStep = 4;
                    }
                }
            }
        }
    }
}

$confirmation = null;
if (!empty($_GET['confirmed'])) {
    $confirmationStmt = $pdo->prepare(
        "SELECT a.*, p.pet_name, s.style_name, g.groomer_name
         FROM grooming_appointments a
         INNER JOIN pets p ON p.id = a.pet_id
         INNER JOIN grooming_styles s ON s.style_id = a.grooming_style_id
         INNER JOIN groomers g ON g.groomer_id = a.groomer_id
         WHERE a.reservation_code = ? AND a.customer_id = ? LIMIT 1"
    );
    $confirmationStmt->execute([$_GET['confirmed'], $customer['id']]);
    $confirmation = $confirmationStmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

$minDate = date('Y-m-d');
$maxDate = date('Y-m-d', strtotime('+90 days'));
$initialStep = $error !== '' ? $errorStep : 1;
$posted = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : [];
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && ($_GET['booking_type'] ?? '') === 'Home Service') $posted['booking_type'] = 'Home Service';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Book Grooming - Dizon's Petshop Grooming</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="../css/style.css">
</head>
<body class="app-bg booking-page">
<script>document.body.classList.add('theme-' + (localStorage.getItem('petshopTheme') || 'dark'));</script>

<div class="top-navbar">
    <div class="d-flex align-items-center gap-2">
        <button type="button" id="sidebarToggle" class="sidebar-toggle-btn" aria-label="Toggle sidebar" aria-expanded="true"><i class="fa-solid fa-bars"></i></button>
        <img src="../images/cutoutlogo.png" alt="Dizon's Pet Grooming" class="navbar-logo">
        <span class="fw-bold fs-5 text-success">Book Grooming</span>
    </div>
    <a href="grooming.php" class="booking-close-link"><i class="fa-solid fa-xmark"></i><span>Close</span></a>
</div>

<?php $activePage = 'grooming'; include __DIR__ . '/sidebar.php'; ?>

<main class="app-main-content booking-main">
<?php if ($confirmation): ?>
    <section class="booking-confirmation-card">
        <div class="booking-success-icon"><i class="fa-solid fa-check"></i></div>
        <span class="booking-status-pill">Pending confirmation</span>
        <h1>Reservation received!</h1>
        <?php if ($confirmation['confirmation_email_sent_at']): ?>
            <p>We sent the booking details to <strong><?= htmlspecialchars($email) ?></strong>.</p>
        <?php else: ?>
            <p>Your reservation was saved, but the confirmation email could not be sent. Keep the reference below.</p>
        <?php endif; ?>
        <div class="booking-reference"><small>Reservation reference</small><strong><?= htmlspecialchars($confirmation['reservation_code']) ?></strong></div>
        <div class="confirmation-grid">
            <div><i class="fa-solid fa-paw"></i><span>Pet</span><strong><?= htmlspecialchars($confirmation['pet_name']) ?></strong></div>
            <div><i class="fa-solid fa-scissors"></i><span>Package</span><strong><?= htmlspecialchars($confirmation['style_name']) ?></strong></div>
            <div><i class="fa-solid fa-calendar-day"></i><span>Date</span><strong><?= date('M j, Y', strtotime($confirmation['appointment_date'])) ?></strong></div>
            <div><i class="fa-solid fa-clock"></i><span>Time</span><strong><?= date('g:i A', strtotime($confirmation['appointment_time'])) ?></strong></div>
            <div><i class="fa-solid fa-user-check"></i><span>Groomer</span><strong><?= htmlspecialchars($confirmation['groomer_name']) ?></strong></div>
            <div><i class="fa-solid fa-peso-sign"></i><span>Total</span><strong>PHP <?= number_format((float) $confirmation['total_price'], 2) ?></strong></div>
        </div>
        <div class="booking-confirmation-actions">
            <p>Loyalty discounts are finalized by completed visit order: 50% on visits 5 and 10, then lifetime 10% off from visit 11.</p>
            <a href="grooming.php" class="booking-btn booking-btn-secondary">Back to Grooming</a>
            <a href="book_grooming.php" class="booking-btn booking-btn-primary">Book Another</a>
        </div>
    </section>
<?php else: ?>
    <header class="booking-heading">
        <span>Easy online reservation</span>
        <h1>Book a grooming visit</h1>
        <p>Choose what your pet needs and review everything before confirming.</p>
    </header>

    <?php if ($error): ?><div class="booking-alert" role="alert"><i class="fa-solid fa-circle-exclamation"></i><?= htmlspecialchars($error) ?></div><?php endif; ?>

    <form method="POST" id="bookingForm" class="booking-layout">
        <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken) ?>">
        <div class="booking-workspace">
            <nav class="booking-stepper" aria-label="Booking progress">
                <?php foreach ([1 => 'Service', 2 => 'Pet', 3 => 'Package', 4 => 'Schedule', 5 => 'Review'] as $number => $label): ?>
                    <button type="button" class="booking-step<?= $number === $initialStep ? ' active' : ($number < $initialStep ? ' complete' : '') ?>" data-step-target="<?= $number ?>"><b><?= $number ?></b><span><?= $label ?></span></button>
                <?php endforeach; ?>
            </nav>

            <section class="booking-panel<?= $initialStep === 1 ? ' active' : '' ?>" data-step="1">
                <div class="booking-panel-heading"><small>Step 1 of 5</small><h2>Where should we groom your pet?</h2></div>
                <div class="choice-grid choice-grid-two">
                    <label class="choice-card"><input type="radio" name="booking_type" value="Salon" <?= ($posted['booking_type'] ?? 'Salon') === 'Salon' ? 'checked' : '' ?>><span class="choice-card-body"><i class="fa-solid fa-store"></i><b>Salon Grooming</b><small>Visit our fully equipped grooming salon.</small></span></label>
                    <label class="choice-card"><input type="radio" name="booking_type" value="Home Service" <?= ($posted['booking_type'] ?? '') === 'Home Service' ? 'checked' : '' ?>><span class="choice-card-body"><i class="fa-solid fa-house-chimney-user"></i><b>Home Service</b><small>We come to your registered address.</small></span></label>
                </div>
                <div class="home-address-note"><i class="fa-solid fa-location-dot"></i><span><small>Service address</small><?= htmlspecialchars($customer['address'] ?: 'No address saved—update your customer profile first.') ?></span></div>
            </section>

            <section class="booking-panel<?= $initialStep === 2 ? ' active' : '' ?>" data-step="2">
                <div class="booking-panel-heading"><small>Step 2 of 5</small><h2>Which pet are we grooming?</h2></div>
                <div class="choice-grid pet-choice-grid">
                    <?php foreach ($pets as $pet): ?>
                        <label class="choice-card pet-choice"><input type="radio" name="pet_id" value="<?= (int) $pet['id'] ?>" <?= (int) ($posted['pet_id'] ?? 0) === (int) $pet['id'] ? 'checked' : '' ?>><span class="choice-card-body"><span class="pet-choice-avatar"><i class="fa-solid fa-paw"></i></span><b><?= htmlspecialchars($pet['pet_name']) ?></b><small><?= htmlspecialchars(trim(($pet['species'] ?? '') . ' · ' . ($pet['breed'] ?? ''), ' ·')) ?></small></span></label>
                    <?php endforeach; ?>
                    <a href="register_pet.php?customer_id=<?= (int) $customer['id'] ?>" class="choice-card add-pet-card"><span class="choice-card-body"><i class="fa-solid fa-plus"></i><b>Add another pet</b><small>Create a new pet profile.</small></span></a>
                </div>
            </section>

            <section class="booking-panel<?= $initialStep === 3 ? ' active' : '' ?>" data-step="3">
                <div class="booking-panel-heading"><small>Step 3 of 5</small><h2>Choose a package and pet size</h2></div>
                <label class="booking-field"><span>Pet size</span><select name="pet_size" id="petSize"><option value="">Select size</option><?php foreach (['Small','Medium','Large','Extra Large','Giant'] as $size): ?><option value="<?= $size ?>" <?= ($posted['pet_size'] ?? '') === $size ? 'selected' : '' ?>><?= $size ?></option><?php endforeach; ?></select></label>
                <div class="choice-grid package-choice-grid">
                    <?php foreach ($styles as $style): ?>
                        <label class="choice-card package-choice"><input type="radio" name="style_id" value="<?= (int) $style['style_id'] ?>" <?= (int) ($posted['style_id'] ?? 0) === (int) $style['style_id'] ? 'checked' : '' ?>><span class="choice-card-body"><i class="fa-solid fa-scissors"></i><b><?= htmlspecialchars($style['style_name']) ?></b><small class="package-price" data-style-price="<?= (int) $style['style_id'] ?>">Select pet size for price</small></span></label>
                    <?php endforeach; ?>
                </div>
                <h3 class="addon-heading">Optional add-ons</h3>
                <div class="addon-choice-grid">
                    <?php foreach ($addons as $addon): ?>
                        <label class="addon-choice"><input type="checkbox" name="addon_ids[]" value="<?= (int) $addon['addon_id'] ?>" data-addon-name="<?= htmlspecialchars($addon['addon_name']) ?>" data-addon-price="<?= (float) $addon['price'] ?>" <?= in_array((string) $addon['addon_id'], array_map('strval', (array) ($posted['addon_ids'] ?? [])), true) ? 'checked' : '' ?>><span><b><?= htmlspecialchars($addon['addon_name']) ?></b><small>+ PHP <?= number_format((float) $addon['price'], 2) ?></small></span><i class="fa-solid fa-check"></i></label>
                    <?php endforeach; ?>
                </div>
            </section>

            <section class="booking-panel<?= $initialStep === 4 ? ' active' : '' ?>" data-step="4">
                <div class="booking-panel-heading"><small>Step 4 of 5</small><h2>Pick your preferred schedule</h2></div>
                <div class="booking-fields-grid">
                    <label class="booking-field"><span>Date</span><input type="date" name="appointment_date" min="<?= $minDate ?>" max="<?= $maxDate ?>" value="<?= htmlspecialchars($posted['appointment_date'] ?? '') ?>"></label>
                    <label class="booking-field"><span>Time</span><select name="appointment_time"><option value="">Select time</option><?php foreach (['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'] as $time): ?><option value="<?= $time ?>" <?= ($posted['appointment_time'] ?? '') === $time ? 'selected' : '' ?>><?= date('g:i A', strtotime($time)) ?></option><?php endforeach; ?></select></label>
                    <label class="booking-field"><span>Preferred groomer</span><select name="groomer_id"><option value="">No preference</option><?php foreach ($groomers as $groomer): ?><option value="<?= (int) $groomer['groomer_id'] ?>" <?= (int) ($posted['groomer_id'] ?? 0) === (int) $groomer['groomer_id'] ? 'selected' : '' ?>><?= htmlspecialchars($groomer['groomer_name']) ?></option><?php endforeach; ?></select></label>
                    <label class="booking-field booking-field-wide"><span>Special instructions <small>(optional)</small></span><textarea name="special_instructions" rows="4" maxlength="1000" placeholder="Tell us about allergies, behavior, or anything your groomer should know."><?= htmlspecialchars($posted['special_instructions'] ?? '') ?></textarea></label>
                </div>
            </section>

            <section class="booking-panel<?= $initialStep === 5 ? ' active' : '' ?>" data-step="5">
                <div class="booking-panel-heading"><small>Step 5 of 5</small><h2>Review your reservation</h2></div>
                <div class="review-card"><i class="fa-solid fa-circle-check"></i><div><b>Everything look right?</b><p>Your reservation will be submitted as pending. We will email your reference and booking details.</p></div></div>
                <div id="mobileReviewSummary" class="mobile-review-summary"></div>
            </section>

            <div class="booking-navigation">
                <button type="button" id="bookingBack" class="booking-btn booking-btn-secondary" hidden><i class="fa-solid fa-arrow-left"></i> Back</button>
                <button type="button" id="bookingNext" class="booking-btn booking-btn-primary">Continue <i class="fa-solid fa-arrow-right"></i></button>
                <button type="submit" id="bookingSubmit" class="booking-btn booking-btn-primary" hidden>Confirm Reservation <i class="fa-solid fa-check"></i></button>
            </div>
        </div>

        <aside class="booking-summary">
            <span class="booking-summary-kicker">Your reservation</span><h2>Booking summary</h2>
            <dl>
                <div><dt>Service</dt><dd id="summaryType">Salon Grooming</dd></div>
                <div><dt>Pet</dt><dd id="summaryPet">Not selected</dd></div>
                <div><dt>Package</dt><dd id="summaryPackage">Not selected</dd></div>
                <div><dt>Schedule</dt><dd id="summarySchedule">Not selected</dd></div>
                <div><dt>Groomer</dt><dd id="summaryGroomer">No preference</dd></div>
                <div><dt>Add-ons</dt><dd id="summaryAddons">None</dd></div>
            </dl>
            <div class="booking-total"><span>Estimated total</span><strong id="summaryTotal">PHP 0.00</strong></div>
            <small>Final availability is checked when you confirm.</small>
        </aside>
    </form>
<?php endif; ?>
</main>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
document.getElementById('sidebarToggle').addEventListener('click', function () {
    document.querySelector('.sidebar').classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed');
});

<?php if (!$confirmation): ?>
(function () {
    const form = document.getElementById('bookingForm');
    const panels = [...document.querySelectorAll('.booking-panel')];
    const steps = [...document.querySelectorAll('.booking-step')];
    const back = document.getElementById('bookingBack');
    const next = document.getElementById('bookingNext');
    const submit = document.getElementById('bookingSubmit');
    const pricing = <?= json_encode($pricing, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>;
    let currentStep = <?= $initialStep ?>;

    function selected(selector) { return form.querySelector(selector + ':checked'); }
    function field(name) { return form.elements[name]; }
    function showStep(step) {
        currentStep = step;
        panels.forEach(panel => panel.classList.toggle('active', Number(panel.dataset.step) === step));
        steps.forEach((item, index) => {
            item.classList.toggle('active', index + 1 === step);
            item.classList.toggle('complete', index + 1 < step);
        });
        back.hidden = step === 1;
        next.hidden = step === 5;
        submit.hidden = step !== 5;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateSummary();
    }
    function validateStep(step) {
        if (step === 1) return !!selected('[name="booking_type"]');
        if (step === 2) return !!selected('[name="pet_id"]');
        if (step === 3) return !!field('pet_size').value && !!selected('[name="style_id"]');
        if (step === 4) return !!field('appointment_date').value && !!field('appointment_time').value;
        return true;
    }
    function labelOf(input) {
        const card = input ? input.closest('label') : null;
        const label = card ? card.querySelector('b') : null;
        return label ? label.textContent.trim() : 'Not selected';
    }
    function updatePrices() {
        const size = field('pet_size').value;
        document.querySelectorAll('[data-style-price]').forEach(node => {
            const value = pricing[node.dataset.stylePrice]?.[size];
            node.textContent = value === undefined ? 'Select pet size for price' : 'From PHP ' + Number(value).toFixed(2);
        });
    }
    function updateSummary() {
        const type = selected('[name="booking_type"]');
        const pet = selected('[name="pet_id"]');
        const style = selected('[name="style_id"]');
        const addons = [...form.querySelectorAll('[name="addon_ids[]"]:checked')];
        const size = field('pet_size').value;
        const date = field('appointment_date').value;
        const time = field('appointment_time').value;
        const groomerSelect = field('groomer_id');
        const base = style && size ? Number(pricing[style.value]?.[size] || 0) : 0;
        const addonTotal = addons.reduce((sum, item) => sum + Number(item.dataset.addonPrice), 0);
        document.getElementById('summaryType').textContent = type?.value || 'Not selected';
        document.getElementById('summaryPet').textContent = labelOf(pet);
        document.getElementById('summaryPackage').textContent = style ? labelOf(style) + (size ? ' · ' + size : '') : 'Not selected';
        document.getElementById('summarySchedule').textContent = date && time ? date + ' · ' + time : 'Not selected';
        document.getElementById('summaryGroomer').textContent = groomerSelect.options[groomerSelect.selectedIndex]?.text || 'No preference';
        document.getElementById('summaryAddons').textContent = addons.length ? addons.map(item => item.dataset.addonName).join(', ') : 'None';
        document.getElementById('summaryTotal').textContent = 'PHP ' + (base + addonTotal).toFixed(2);
        document.querySelector('.home-address-note').classList.toggle('show', type?.value === 'Home Service');
        const mobile = document.getElementById('mobileReviewSummary');
        mobile.innerHTML = document.querySelector('.booking-summary dl').outerHTML + document.querySelector('.booking-total').outerHTML;
    }

    next.addEventListener('click', function () {
        if (!validateStep(currentStep)) {
            const panel = document.querySelector('[data-step="' + currentStep + '"]');
            panel.classList.add('shake'); setTimeout(() => panel.classList.remove('shake'), 400);
            return;
        }
        showStep(Math.min(5, currentStep + 1));
    });
    back.addEventListener('click', () => showStep(Math.max(1, currentStep - 1)));
    steps.forEach((step, index) => step.addEventListener('click', () => { if (index + 1 < currentStep) showStep(index + 1); }));
    form.addEventListener('change', function () { updatePrices(); updateSummary(); });
    form.addEventListener('submit', function (event) {
        for (let step = 1; step <= 4; step++) {
            if (!validateStep(step)) { event.preventDefault(); showStep(step); return; }
        }
        submit.disabled = true;
        submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving reservation...';
    });
    updatePrices(); showStep(currentStep);
})();
<?php endif; ?>
</script>
</body>
</html>
