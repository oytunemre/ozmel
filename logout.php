<?php
/** QFW Program — çıkış (logout): oturumu sunucu tarafında geçersiz kılar. */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$config = require __DIR__ . '/config.php';
$input = json_decode(file_get_contents('php://input'), true);
$token = $input['token'] ?? '';

try {
    $pdo = new PDO(
        "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4",
        $config['db_user'],
        $config['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $stmt = $pdo->prepare('DELETE FROM sessions WHERE token = :t');
    $stmt->execute(['t' => $token]);
} catch (Exception $e) {
    // sessizce yoksay — çıkış zaten istemci tarafında da temizlenecek
}

echo json_encode(['ok' => true]);
