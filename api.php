<?php
/**
 * QFW Program — veri API'si
 * Oturum token'ı ile doğrulama yapar. Sadece 'editor' rolü yazabilir (POST);
 * 'viewer' rolü sadece okuyabilir (GET). Token, login.php ile alınır.
 *
 * GET  /api.php   (header: X-Session-Token)  -> mevcut veriyi döndürür
 * POST /api.php   (header: X-Session-Token)  -> gönderilen JSON'u kaydeder (sadece editor)
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Session-Token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$config = require __DIR__ . '/config.php';

if (($config['db_pass'] ?? '') === 'BURAYA_VERITABANI_SIFRESINI_YAZIN') {
    http_response_code(500);
    echo json_encode(['error' => 'config.php henüz düzenlenmemiş — veritabanı bilgilerinizi girin']);
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4",
        $config['db_user'],
        $config['db_pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Veritabanı bağlantı hatası. config.php bilgilerini kontrol edin.']);
    exit;
}

// --- oturum doğrulama ---
$token = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
if ($token === '') {
    http_response_code(401);
    echo json_encode(['error' => 'Oturum bulunamadı — lütfen giriş yapın', 'code' => 'NO_SESSION']);
    exit;
}

$stmt = $pdo->prepare('SELECT * FROM sessions WHERE token = :t AND expires_at > NOW()');
$stmt->execute(['t' => $token]);
$session = $stmt->fetch();

if (!$session) {
    http_response_code(401);
    echo json_encode(['error' => 'Oturum süresi dolmuş — lütfen tekrar giriş yapın', 'code' => 'SESSION_EXPIRED']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT data FROM app_data WHERE id = 1');
    $stmt->execute();
    $row = $stmt->fetch();
    echo $row ? $row['data'] : 'null';
    exit;
}

if ($method === 'POST') {
    if ($session['role'] !== 'editor') {
        http_response_code(403);
        echo json_encode(['error' => 'Bu işlem için yetkiniz yok (görüntüleyici hesabı)']);
        exit;
    }

    $body = file_get_contents('php://input');
    json_decode($body);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Geçersiz JSON']);
        exit;
    }
    if (strlen($body) > 16 * 1024 * 1024) {
        http_response_code(413);
        echo json_encode(['error' => 'Veri çok büyük']);
        exit;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO app_data (id, data) VALUES (1, :data)
         ON DUPLICATE KEY UPDATE data = :data2'
    );
    $stmt->execute(['data' => $body, 'data2' => $body]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Desteklenmeyen metod']);
