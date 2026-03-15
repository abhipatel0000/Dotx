<?php
require_once 'security.php'; // 🛡️ LOAD SECURITY RULES FIRST
require_once 'db.php';
header('Content-Type: application/json');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

// Helper function to sanitize phone numbers
function sanitizePhone($phone)
{
    // Strip everything except digits and the plus sign
    return preg_replace('/[^\d+]/', '', $phone);
}

// Ensure a specific column exists in a table; used for optional profile fields.
function ensureColumn(PDO $pdo, string $table, string $column, string $definition)
{
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        $res = $stmt->fetch();
        if (!$res) {
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN $column $definition");
        } else {
            // If column exists, check if it's too small (e.g. TEXT instead of LONGTEXT)
            $type = strtolower($res['Type']);
            if (strpos($definition, 'LONGTEXT') !== false && strpos($type, 'longtext') === false) {
                // Force upgrade to LONGTEXT
                $pdo->exec("ALTER TABLE `$table` MODIFY COLUMN $column $definition");
            }
        }
    } catch (PDOException $e) {
        // If we can't modify schema (e.g., limited privileges), proceed without failing.
    }
}

// 1. CHECK IF USER EXISTS (For Login/Signup Flow)
if ($action === 'check_user') {
    $phone = sanitizePhone($_POST['phone'] ?? '');
    $stmt = $pdo->prepare("SELECT name, public_key FROM users WHERE phone = ?");
    $stmt->execute([$phone]);
    $user = $stmt->fetch();

    if ($user) {
        echo json_encode(['status' => 'exists', 'name' => $user['name']]);
    } else {
        echo json_encode(['status' => 'new']);
    }
    exit;
}

// 2. REGISTER NEW USER (Save Public Key)
if ($action === 'register') {
    $phone = sanitizePhone($_POST['phone'] ?? '');
    // Sanitize the name with basic HTML escaping
    $rawName = $_POST['name'] ?? '';
    $name = htmlspecialchars(trim($rawName), ENT_QUOTES, 'UTF-8') ?: 'User ' . substr($phone, -4);
    $publicKey = $_POST['public_key'] ?? ''; // Client generates this

    $stmt = $pdo->prepare("INSERT INTO users (phone, name, public_key) VALUES (?, ?, ?)");
    if ($stmt->execute([$phone, $name, $publicKey])) {
        $_SESSION['user_phone'] = $phone;
        echo json_encode(['status' => 'success']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Could not register']);
    }
    exit;
}

// 3. LOGIN (Session Start)
if ($action === 'login') {
    $_SESSION['user_phone'] = sanitizePhone($_POST['phone'] ?? '');
    echo json_encode(['status' => 'success']);
    exit;
}

// 3a. LOGIN_SESSION — silently restore PHP session for an existing tab (from sessionStorage)
if ($action === 'login_session') {
    $phone = $_POST['phone'] ?? '';
    $stmt = $pdo->prepare("SELECT phone, name, profile_photo FROM users WHERE phone = ?");
    $stmt->execute([$phone]);
    $user = $stmt->fetch();
    if ($user) {
        $_SESSION['user_phone'] = $phone;
        echo json_encode(['status' => 'success', 'name' => $user['name'], 'profile_photo' => $user['profile_photo'] ?? '']);
    } else {
        echo json_encode(['status' => 'error']);
    }
    exit;
}

// 3b. GET MY OWN PUBLIC KEY (So client can encrypt for self without localStorage)
if ($action === 'get_my_key') {
    $phone = $_GET['phone'] ?? $_POST['phone'] ?? $_SESSION['user_phone'];

    // Ensure profile_photo column exists (optional feature)
    // Ensure profile_photo column exists and is large enough
    ensureColumn($pdo, 'users', 'profile_photo', 'LONGTEXT NULL');

    $profilePhoto = '';
    try {
        $stmt = $pdo->prepare("SELECT name, public_key, profile_photo FROM users WHERE phone = ?");
        $stmt->execute([$phone]);
        $row = $stmt->fetch();
        $profilePhoto = $row['profile_photo'] ?? '';
    } catch (PDOException $e) {
        $stmt = $pdo->prepare("SELECT name, public_key FROM users WHERE phone = ?");
        $stmt->execute([$phone]);
        $row = $stmt->fetch();
    }

    echo json_encode([
        'status' => 'success',
        'name' => $row['name'] ?? '',
        'public_key' => $row['public_key'] ?? '',
        'profile_photo' => $profilePhoto,
    ]);
    exit;
}

// 3c. UPDATE PROFILE (name / profile photo)
if ($action === 'update_profile') {
    $phone = $_POST['phone'] ?? $_SESSION['user_phone'];
    $rawName = $_POST['name'] ?? '';
    $name = htmlspecialchars(trim($rawName), ENT_QUOTES, 'UTF-8') ?: null;
    $photo = $_POST['profile_photo'] ?? null;

    // Only accept valid data URLs for profile photos (protect against abuse)
    if ($photo && strpos($photo, 'data:image/') !== 0) {
        $photo = null;
    }
    // Keep profile photo size reasonable (8MB limit for Base64)
    if ($photo && strlen($photo) > 8_000_000) {
        $photo = null;
    }

    // Ensure column exists before trying to save
    // Ensure column exists and is large enough
    ensureColumn($pdo, 'users', 'profile_photo', 'LONGTEXT NULL');

    // Build UPDATE query dynamically to avoid updating null values unnecessarily
    $fields = [];
    $values = [];
    if ($name !== null) {
        $fields[] = 'name = ?';
        $values[] = $name;
    }
    if ($photo !== null) {
        $fields[] = 'profile_photo = ?';
        $values[] = $photo;
    }

    if ($fields) {
        $values[] = $phone;
        try {
            $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE phone = ?');
            $stmt->execute($values);
        } catch (PDOException $e) {
            // If profile_photo column isn't available, retry without it
            if (strpos($e->getMessage(), 'Unknown column') !== false && $photo !== null) {
                $fields = array_filter($fields, function ($f) {
                    return strpos($f, 'profile_photo') === false;
                });
                $values = [$name, $phone];
                $stmt = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE phone = ?');
                $stmt->execute($values);
            }
        }
    }

    echo json_encode(['status' => 'success']);
    exit;
}

// 4. ADD CONTACT (Search DB)
if ($action === 'add_contact') {
    $myPhone = sanitizePhone($_POST['phone'] ?? $_SESSION['user_phone'] ?? '');
    $targetPhone = sanitizePhone($_POST['contact_phone'] ?? '');

    // Check if target exists
    $stmt = $pdo->prepare("SELECT * FROM users WHERE phone = ?");
    $stmt->execute([$targetPhone]);
    $target = $stmt->fetch();

    if ($target) {
        // Add to contacts table
        $add = $pdo->prepare("INSERT IGNORE INTO contacts (user_phone, contact_phone) VALUES (?, ?)");
        $add->execute([$myPhone, $targetPhone]);
        echo json_encode(['status' => 'success', 'user' => $target]);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'User not found on DoTX']);
    }
    exit;
}

// 5. GET CONTACTS & MESSAGES
if ($action === 'sync') {
    $myPhone = $_GET['phone'] ?? $_POST['phone'] ?? $_SESSION['user_phone'];

    // Ensure optional profile_photo column exists for contact avatars
    // Ensure optional profile_photo column exists for contact avatars
    ensureColumn($pdo, 'users', 'profile_photo', 'LONGTEXT NULL');

    // Get Contacts + People who sent us messages (Stranger handling)
    $contacts = [];
    try {
        $cStmt = $pdo->prepare("
            SELECT u.phone, u.name, u.public_key, COALESCE(u.profile_photo, '') AS profile_photo,
            (SELECT COUNT(*) FROM messages WHERE sender_phone = u.phone AND receiver_phone = ? AND is_read = 0) as unread_count,
            EXISTS(SELECT 1 FROM contacts WHERE user_phone = ? AND contact_phone = u.phone) as is_contact
            FROM users u
            WHERE u.phone IN (SELECT contact_phone FROM contacts WHERE user_phone = ?)
               OR u.phone IN (SELECT sender_phone FROM messages WHERE receiver_phone = ?)
        ");
        $cStmt->execute([$myPhone, $myPhone, $myPhone, $myPhone]);
        $contacts = $cStmt->fetchAll();
    } catch (PDOException $e) {
        // Fallback or handle missing columns
        $contacts = [];
    }

    // Get Messages (Sent and Received)
    $mStmt = $pdo->prepare("
        SELECT * FROM messages 
        WHERE sender_phone = ? OR receiver_phone = ? 
        ORDER BY timestamp ASC
    ");
    $mStmt->execute([$myPhone, $myPhone]);
    $messages = $mStmt->fetchAll();

    echo json_encode(['contacts' => $contacts, 'messages' => $messages]);
    exit;
}

// 6. SEND MESSAGE
if ($action === 'send') {
    $sender = sanitizePhone($_POST['phone'] ?? $_SESSION['user_phone'] ?? '');
    $receiver = sanitizePhone($_POST['receiver'] ?? '');
    $cipher = $_POST['ciphertext'];
    $iv = $_POST['iv'];
    $senderCipher = $_POST['sender_ciphertext'] ?? null;

    try {
        // Try with sender_ciphertext column (requires ALTER TABLE to have been run)
        $stmt = $pdo->prepare("INSERT INTO messages (sender_phone, receiver_phone, ciphertext, sender_ciphertext, iv) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$sender, $receiver, $cipher, $senderCipher, $iv]);
    } catch (PDOException $e) {
        // Fallback: column doesn't exist yet — save without it
        $stmt = $pdo->prepare("INSERT INTO messages (sender_phone, receiver_phone, ciphertext, iv) VALUES (?, ?, ?, ?)");
        $stmt->execute([$sender, $receiver, $cipher, $iv]);
    }
    $newId = $pdo->lastInsertId();
    echo json_encode(['status' => 'success', 'id' => $newId]);
    exit;
}

// 7. MARK MESSAGES AS READ
if ($action === 'mark_read') {
    $myPhone = sanitizePhone($_POST['phone'] ?? $_SESSION['user_phone'] ?? '');
    $senderPhone = sanitizePhone($_POST['sender'] ?? '');

    $stmt = $pdo->prepare("UPDATE messages SET is_read = 1 WHERE sender_phone = ? AND receiver_phone = ? AND is_read = 0");
    $stmt->execute([$senderPhone, $myPhone]);
    echo json_encode(['status' => 'success']);
    exit;
}

// 8. LOGOUT
if ($action === 'logout') {
    session_destroy();
    echo json_encode(['status' => 'success']);
    exit;
}
?>