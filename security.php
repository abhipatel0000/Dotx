<?php
// security.php — DoTX Security Hardening

// 1. HTTP Security Headers
header("X-Frame-Options: SAMEORIGIN"); // Prevent Clickjacking
header("X-XSS-Protection: 1; mode=block"); // Basic XSS Protection
header("X-Content-Type-Options: nosniff"); // Prevent MIME type sniffing
header("Referrer-Policy: strict-origin-when-cross-origin"); // Control Referer leaks
header("Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"); // Enforce HTTPS

// 2. Block Known Vulnerability Scanners & Bots
$user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
$blocked_agents = [
    'sqlmap',
    'nikto',
    'burp',
    'scan',
    'nmap',
    'zaproxy',
    'wpscan'
];

foreach ($blocked_agents as $bot) {
    if (stripos($user_agent, $bot) !== false) {
        http_response_code(403);
        die("403 Forbidden: Access Denied.");
    }
}

// 3. Basic Rate Limiting
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$time_limit = 5; // Allow max X requests per $time_limit seconds
$max_requests = 20;

if (!isset($_SESSION['req_count'])) {
    $_SESSION['req_count'] = 1;
    $_SESSION['req_start_time'] = time();
} else {
    $current_time = time();
    $time_diff = $current_time - $_SESSION['req_start_time'];

    if ($time_diff < $time_limit) {
        $_SESSION['req_count']++;
        if ($_SESSION['req_count'] > $max_requests) {
            http_response_code(429);
            die(json_encode(['status' => 'error', 'message' => '429 Too Many Requests. Slow down.']));
        }
    } else {
        // Reset the counter
        $_SESSION['req_count'] = 1;
        $_SESSION['req_start_time'] = $current_time;
    }
}

// 4. Validate Request Method
$allowed_methods = ['GET', 'POST', 'OPTIONS'];
if (!in_array($_SERVER['REQUEST_METHOD'], $allowed_methods)) {
    http_response_code(405);
    die("405 Method Not Allowed.");
}
?>