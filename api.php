<?php
/**
 * QFW Program — veri API'si (tablo tabanlı)
 *
 * Eski blob uçları KORUNDU; geri dönüş yolu olarak duruyor:
 *   GET  /api.php                  -> app_data.data (tüm JSON)
 *   POST /api.php                  -> app_data.data yaz  (sadece editor)
 *
 * Yeni tablo uçları:
 *   GET    /api.php?r=parts            -> tüm satırlar (dizi)
 *   GET    /api.php?r=parts&id=xxx     -> tek satır
 *   GET    /api.php?r=_all             -> tüm tablolar tek pakette (boot için)
 *   POST   /api.php?r=parts            -> ekle (gövde: nesne veya nesne dizisi)
 *   PUT    /api.php?r=parts&id=xxx     -> tek satırı güncelle
 *   PUT    /api.php?r=parts            -> TÜM tabloyu gönderilen diziyle değiştir
 *   DELETE /api.php?r=parts&id=xxx     -> sil
 *
 * Sunucu PUT/DELETE'i engelliyorsa aynı işlemler POST ile:
 *   POST /api.php?r=parts&op=guncelle&id=xxx
 *   POST /api.php?r=parts&op=degistir
 *   POST /api.php?r=parts&op=sil&id=xxx
 *
 * Yetki: GET herkese (editor+viewer), yazma işlemleri sadece editor.
 */

// ---------------------------------------------------------------- ayar

$config = require __DIR__ . '/config.php';

// CORS: config.php'ye 'allowed_origin' ekleyebilirsiniz (örn. 'https://ozmel.com').
// Tanımlı değilse eski davranış (*) korunur.
$allowedOrigin = $config['allowed_origin'] ?? '*';
header('Access-Control-Allow-Origin: ' . $allowedOrigin);
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Session-Token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/** Beyaz liste — buraya yazılmayan hiçbir tabloya erişilemez. */
const TABLES = [
    'suppliers', 'parts', 'milestones', 'audits',
    'dim_characteristics', 'dim_measurements',
    'products', 'work_centers', 'routes', 'capacities',
    'control_plan', 'first_off_points', 'hourly_points',
    'lookups', 'quality_measurements',
    'gorev_kisiler', 'gorevler', 'urun_agaclari',
];

/** _all isteğinde bu sırayla döner (ebeveyn önce). */
const ALL_ORDER = [
    'lookups', 'suppliers', 'products', 'work_centers', 'parts',
    'milestones', 'audits', 'dim_characteristics', 'dim_measurements',
    'routes', 'capacities', 'control_plan', 'first_off_points',
    'hourly_points', 'quality_measurements',
    'gorev_kisiler', 'gorevler', 'urun_agaclari',
];

function fail(int $code, string $msg, ?string $errCode = null): never {
    http_response_code($code);
    $out = ['error' => $msg];
    if ($errCode !== null) {
        $out['code'] = $errCode;
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($config['db_pass'] ?? '') === 'BURAYA_VERITABANI_SIFRESINI_YAZIN') {
    fail(500, 'config.php henüz düzenlenmemiş — veritabanı bilgilerinizi girin');
}

// ---------------------------------------------------------------- bağlantı

try {
    $pdo = new PDO(
        "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4",
        $config['db_user'],
        $config['db_pass'],
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (Exception $e) {
    fail(500, 'Veritabanı bağlantı hatası. config.php bilgilerini kontrol edin.');
}

// ---------------------------------------------------------------- oturum

$token = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
if ($token === '') {
    fail(401, 'Oturum bulunamadı — lütfen giriş yapın', 'NO_SESSION');
}

$stmt = $pdo->prepare('SELECT * FROM sessions WHERE token = :t AND expires_at > NOW()');
$stmt->execute(['t' => $token]);
$session = $stmt->fetch();
if (!$session) {
    fail(401, 'Oturum süresi dolmuş — lütfen tekrar giriş yapın', 'SESSION_EXPIRED');
}

// Bazı sunucular (Plesk + mod_security) PUT/DELETE isteklerini — hatta istekte
// geçen "PUT" ifadesini bile — PHP'ye ulaşmadan 403 ile keser. Bu yüzden yazma
// işlemleri POST + ?op= ile de yapılabilir. Değerler bilinçli olarak İngilizce
// HTTP/SQL anahtar kelimesi DEĞİL, aksi halde aynı filtreye takılır:
//     ?op=guncelle  -> tek satır güncelle   (PUT + id)
//     ?op=degistir  -> tüm tabloyu değiştir (PUT, id yok)
//     ?op=sil       -> satır sil            (DELETE)
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    switch (strtolower($_GET['op'] ?? '')) {
        case 'guncelle':
        case 'degistir':
            $method = 'PUT';
            break;
        case 'sil':
            $method = 'DELETE';
            break;
    }
}
$isEditor = ($session['role'] === 'editor');
$actor    = $session['display_name'] ?? '';

/** Yazma işlemlerinde çağrılır. 'code' alanı var ki istemci boşuna tekrar denemesin. */
function requireEditor(bool $isEditor): void {
    if (!$isEditor) {
        fail(403, 'Bu işlem için yetkiniz yok (görüntüleyici hesabı)', 'FORBIDDEN');
    }
}

/** Gövdeyi okur. Boyut kontrolü parse'dan ÖNCE yapılır. */
function readJsonBody(int $maxBytes = 16 * 1024 * 1024): mixed {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > $maxBytes) {
        fail(413, 'Veri çok büyük');
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        fail(400, 'Geçersiz JSON');
    }
    return $data;
}

// ================================================================
//  ESKİ BLOB UÇLARI — ?r yoksa devreye girer (geri dönüş yolu)
// ================================================================

$route = $_GET['r'] ?? null;

if ($route === null) {
    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT data FROM app_data WHERE id = 1');
        $row  = $stmt->fetch();
        echo $row ? $row['data'] : 'null';
        exit;
    }
    if ($method === 'POST') {
        requireEditor($isEditor);
        $raw = file_get_contents('php://input');
        if (strlen($raw) > 16 * 1024 * 1024) {
            fail(413, 'Veri çok büyük');
        }
        json_decode($raw);
        if (json_last_error() !== JSON_ERROR_NONE) {
            fail(400, 'Geçersiz JSON');
        }
        $stmt = $pdo->prepare(
            'INSERT INTO app_data (id, data) VALUES (1, :d)
             ON DUPLICATE KEY UPDATE data = :d2'
        );
        $stmt->execute(['d' => $raw, 'd2' => $raw]);
        echo json_encode(['ok' => true]);
        exit;
    }
    fail(405, 'Desteklenmeyen metod');
}

// ================================================================
//  TABLO UÇLARI
// ================================================================

/** Tablonun gerçek kolonlarını döndürür — gövdedeki fazla alanlar elenir. */
function tableColumns(PDO $pdo, string $table): array {
    static $cache = [];
    if (isset($cache[$table])) {
        return $cache[$table];
    }
    $stmt = $pdo->prepare(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t'
    );
    $stmt->execute(['t' => $table]);
    return $cache[$table] = $stmt->fetchAll(PDO::FETCH_COLUMN);
}

/** Sadece tabloda gerçekten var olan alanları geçirir. */
function filterRow(array $row, array $cols): array {
    return array_intersect_key($row, array_flip($cols));
}

/** id yoksa üretir — istemcideki uid() ile aynı biçim (16 hex). */
function newId(): string {
    return bin2hex(random_bytes(8));
}

function logChange(PDO $pdo, string $table, string $rowId, string $action,
                   string $actor, ?array $before, ?array $after): void {
    $stmt = $pdo->prepare(
        'INSERT INTO audit_log (table_name, row_id, action, changed_by, before_json, after_json)
         VALUES (:t, :r, :a, :u, :b, :f)'
    );
    $stmt->execute([
        't' => $table,
        'r' => $rowId,
        'a' => $action,
        'u' => $actor,
        'b' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE),
        'f' => $after  === null ? null : json_encode($after,  JSON_UNESCAPED_UNICODE),
    ]);
}

function fetchRow(PDO $pdo, string $table, string $id): ?array {
    $stmt = $pdo->prepare("SELECT * FROM `$table` WHERE id = :id");
    $stmt->execute(['id' => $id]);
    return $stmt->fetch() ?: null;
}

// ---- ?r=_all : boot() için tek istekte tüm tablolar ----
if ($route === '_all') {
    if ($method !== 'GET') {
        fail(405, 'Desteklenmeyen metod');
    }
    $out = [];
    foreach (ALL_ORDER as $t) {
        $out[$t] = $pdo->query("SELECT * FROM `$t`")->fetchAll();
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

if (!in_array($route, TABLES, true)) {
    fail(404, 'Bilinmeyen kaynak: ' . $route);
}
$table = $route;                       // beyaz listeden geçti, güvenli
$cols  = tableColumns($pdo, $table);
$id    = $_GET['id'] ?? null;

// ---- GET ----
if ($method === 'GET') {
    if ($id !== null) {
        $row = fetchRow($pdo, $table, $id);
        if (!$row) {
            fail(404, 'Kayıt bulunamadı');
        }
        echo json_encode($row, JSON_UNESCAPED_UNICODE);
        exit;
    }
    $rows = $pdo->query("SELECT * FROM `$table`")->fetchAll();
    echo json_encode($rows, JSON_UNESCAPED_UNICODE);
    exit;
}

requireEditor($isEditor);

// ---- POST: ekle (tek nesne veya dizi) ----
if ($method === 'POST') {
    $body = readJsonBody();
    $rows = array_is_list($body ?? []) ? $body : [$body];
    if (!$rows) {
        fail(400, 'Boş gövde');
    }

    $pdo->beginTransaction();
    try {
        $ids = [];
        foreach ($rows as $r) {
            if (!is_array($r)) {
                fail(400, 'Gövdedeki her öğe nesne olmalı');
            }
            $r = filterRow($r, $cols);
            if (empty($r['id'])) {
                $r['id'] = newId();
            }
            $names = array_keys($r);
            $sql = "INSERT INTO `$table` (" . implode(',', array_map(fn($c) => "`$c`", $names)) . ') VALUES ('
                 . implode(',', array_map(fn($c) => ":$c", $names)) . ')';
            $pdo->prepare($sql)->execute($r);
            logChange($pdo, $table, $r['id'], 'INSERT', $actor, null, $r);
            $ids[] = $r['id'];
        }
        $pdo->commit();
        echo json_encode(['ok' => true, 'ids' => $ids]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        fail(400, 'Kayıt eklenemedi: ' . $e->getMessage());
    }
    exit;
}

// ---- PUT ----
if ($method === 'PUT') {
    $body = readJsonBody();

    // (a) id verilmişse tek satır güncelle
    if ($id !== null) {
        if (!is_array($body) || array_is_list($body)) {
            fail(400, 'Gövde tek bir nesne olmalı');
        }
        $before = fetchRow($pdo, $table, $id);
        if (!$before) {
            fail(404, 'Kayıt bulunamadı');
        }
        $r = filterRow($body, $cols);
        unset($r['id']);                       // id değiştirilemez
        if (!$r) {
            fail(400, 'Güncellenecek alan yok');
        }
        $set = implode(',', array_map(fn($c) => "`$c` = :$c", array_keys($r)));
        $pdo->prepare("UPDATE `$table` SET $set WHERE id = :__id")
            ->execute($r + ['__id' => $id]);
        logChange($pdo, $table, $id, 'UPDATE', $actor, $before, fetchRow($pdo, $table, $id));
        echo json_encode(['ok' => true]);
        exit;
    }

    // (b) id yoksa TÜM tabloyu gönderilen diziyle değiştir.
    //     index.html'deki persist('<tablo>') bu ucu kullanır.
    if (!is_array($body) || !array_is_list($body)) {
        fail(400, 'Gövde bir dizi olmalı');
    }
    $pdo->beginTransaction();
    try {
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
        $pdo->exec("DELETE FROM `$table`");
        $n = 0;
        foreach ($body as $r) {
            if (!is_array($r)) {
                continue;
            }
            $r = filterRow($r, $cols);
            if (empty($r['id'])) {
                $r['id'] = newId();
            }
            $names = array_keys($r);
            $sql = "INSERT INTO `$table` (" . implode(',', array_map(fn($c) => "`$c`", $names)) . ') VALUES ('
                 . implode(',', array_map(fn($c) => ":$c", $names)) . ')';
            $pdo->prepare($sql)->execute($r);
            $n++;
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        logChange($pdo, $table, '*', 'UPDATE', $actor, null, ['replaced' => $n]);
        $pdo->commit();
        echo json_encode(['ok' => true, 'count' => $n]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        fail(400, 'Tablo değiştirilemedi: ' . $e->getMessage());
    }
    exit;
}

// ---- DELETE ----
if ($method === 'DELETE') {
    if ($id === null) {
        fail(400, 'id parametresi zorunlu');
    }
    $before = fetchRow($pdo, $table, $id);
    if (!$before) {
        fail(404, 'Kayıt bulunamadı');
    }
    $pdo->prepare("DELETE FROM `$table` WHERE id = :id")->execute(['id' => $id]);
    logChange($pdo, $table, $id, 'DELETE', $actor, $before, null);
    echo json_encode(['ok' => true]);
    exit;
}

fail(405, 'Desteklenmeyen metod');
