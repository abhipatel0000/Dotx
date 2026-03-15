<?php
// db.php — DoTX Database Connection
require_once 'env.php';

$db_host = $_ENV['DB_HOST'] ?? 'localhost';
$db_name = $_ENV['DB_NAME'] ?? 'dotx';
$db_user = $_ENV['DB_USER'] ?? 'root';
$db_pass = $_ENV['DB_PASS'] ?? '';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    // SECURITY: Do not expose raw database errors to the client
    error_log('DB Connection Failed: ' . $e->getMessage()); // Log internally
    die(json_encode(['status' => 'error', 'message' => 'Internal Server Error.']));
}
?>