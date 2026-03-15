<?php
// db.php — DoTX Database Connection
$db_host = 'localhost';
$db_name = 'dotx';
$db_user = 'root';
$db_pass = 'Abhishek@oracle_2005';

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