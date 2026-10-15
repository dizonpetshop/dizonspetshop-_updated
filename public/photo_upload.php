<?php
// Store one uploaded image and return its browser-relative path.
function saveUploadedPhoto(array $file, string $prefix): ?string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }

    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK || ($file['size'] ?? 0) > 5 * 1024 * 1024) {
        throw new RuntimeException('Please upload an image smaller than 5 MB.');
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $extensions = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
    ];

    if (!isset($extensions[$mime])) {
        throw new RuntimeException('Please upload a JPG, PNG, GIF, or WEBP image.');
    }

    $uploadDirectory = __DIR__ . '/uploads';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true)) {
        throw new RuntimeException('The photo upload folder could not be created.');
    }

    $filename = $prefix . '_' . bin2hex(random_bytes(12)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($file['tmp_name'], $uploadDirectory . '/' . $filename)) {
        throw new RuntimeException('The photo could not be saved.');
    }

    return 'uploads/' . $filename;
}

// Add the photo column for databases created before photo uploads were added.
function ensurePhotoColumn(mysqli $connection, string $table): void
{
    $allowedTables = ['customers', 'pets'];
    if (!in_array($table, $allowedTables, true)) {
        throw new InvalidArgumentException('Invalid photo table.');
    }

    $result = $connection->query("SHOW COLUMNS FROM `$table` LIKE 'photo_path'");
    if ($result && $result->num_rows === 0) {
        $connection->query("ALTER TABLE `$table` ADD photo_path VARCHAR(255) DEFAULT NULL");
    }
}