<?php
// db.php — DoTX Database Connection

$db_host = getenv('DB_HOST') ?: 'yamanote.proxy.rlwy.net';
$db_port = getenv('DB_PORT') ?: '14734';
$db_name = getenv('DB_NAME') ?: 'railway';
$db_user = getenv('DB_USER') ?: 'root';
$db_pass = getenv('DB_PASS') ?: 'rOlapWOwttoZusTgEYEtNxuhVdwHmdTG';

try {
    $pdo = new PDO("mysql:host=$db_host;port=$db_port;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    error_log('DB Connection Failed: ' . $e->getMessage());
    die(json_encode(['status' => 'error', 'message' => 'Internal Server Error.']));
}
?>