<?php
/**
 * QFW Program — giriş (login) uç noktası.
 * POST { username, password } -> { token, role, displayName }
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Desteklenmeyen metod']);
    exit;
}

$config = require __DIR__ . '/config.php';

// Giriş, sunucuya yapılan ilk istek olduğu için kurulum hatasını burada da yakalıyoruz.
if (($config['db_pass'] ?? '') === 'BURAYA_VERITABANI_SIFRESINI_YAZIN') {
    http_response_code(500);
    echo json_encode(['error' => 'config.php henüz düzenlenmemiş — veritabanı şifrenizi girin']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$username = trim($input['username'] ?? '');
$password = (string)($input['password'] ?? '');

if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Kullanıcı adı ve şifre gerekli']);
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4",
        $config['db_user'],
        $config['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Veritabanı bağlantı hatası. config.php bilgilerini kontrol edin.']);
    exit;
}

$stmt = $pdo->prepare('SELECT * FROM users WHERE username = :u');
$stmt->execute(['u' => $username]);
$user = $stmt->fetch();

// Yanlış kullanıcı adında da doğru şifrede olduğu kadar zaman harcayarak
// zamanlama (timing) tabanlı kullanıcı adı tahminini zorlaştırır.
$dummyHash = '$2y$10$abcdefghijklmnopqrstuuQx0000000000000000000000000000';
$hashToCheck = $user['password_hash'] ?? $dummyHash;
$passwordOk = password_verify($password, $hashToCheck);

if (!$user || !$passwordOk) {
    http_response_code(401);
    echo json_encode(['error' => 'Kullanıcı adı veya şifre hatalı']);
    exit;
}

// Pasife alınmış hesaplar giriş yapamaz (v2 Kullanıcı Yönetimi'nin is_active alanı).
// Sütun yoksa (migrasyon öncesi eski kurulum) hesap aktif kabul edilir.
if (array_key_exists('is_active', $user) && (int)$user['is_active'] === 0) {
    http_response_code(403);
    echo json_encode(['error' => 'Hesabınız pasif durumda. Yöneticinize başvurun.']);
    exit;
}

// Süresi dolmuş eski oturumları arada bir temizle (basit bakım)
$pdo->exec('DELETE FROM sessions WHERE expires_at < NOW()');

$token = bin2hex(random_bytes(32));
$expires = date('Y-m-d H:i:s', time() + 60 * 60 * 24 * 7); // 7 gün geçerli

$stmt = $pdo->prepare(
    'INSERT INTO sessions (token, user_id, role, display_name, expires_at) VALUES (:t, :uid, :r, :dn, :e)'
);
$stmt->execute([
    't' => $token,
    'uid' => $user['id'],
    'r' => $user['role'],
    'dn' => $user['display_name'],
    'e' => $expires,
]);

echo json_encode([
    'token' => $token,
    'role' => $user['role'],
    'displayName' => $user['display_name'],
]);
