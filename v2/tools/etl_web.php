<?php
declare(strict_types=1);

/**
 * etl_web.php — GECICI tarayici sarmalayicisi (SSH yok; Plesk File Manager + tarayici).
 *
 *   .../v2/tools/etl_web.php?key=<ANAHTAR>           -> DRY-RUN (varsayilan, HICBIR SEY yazmaz)
 *   .../v2/tools/etl_web.php?key=<ANAHTAR>&live=1     -> CANLI (v2 tablolarina yazar)
 *   ...&file=/mutlak/yol.json                         -> belirli dosya (varsayilan: data/ ilk *.json)
 *
 * GUVENLIK: yalnizca anahtari bilen calistirir; eslemezse 403. ETL yeniden
 * calistirilabilir (legacy_id upsert) — canli tekrar zararsiz.
 *
 * !!! TEST BITINCE BU DOSYAYI SILIN. Kalici bir uc nokta DEGILDIR. !!!
 */

// >>> DEGISTIRIN: uzun, tahmin edilemez bir deger yapin (URL'de ?key=... ile eslesecek). <<<
const ETL_WEB_KEY = 'ozmel-etl-3f9c7a1e8b2d46f0-DEGISTIR';

// Sabit zamanli karsilastirma (zamanlama sizintisina karsi).
if (!hash_equals(ETL_WEB_KEY, (string) ($_GET['key'] ?? ''))) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "403 — gecersiz anahtar";
    exit;
}

@set_time_limit(0);                 // ETL ~1500 kayit + cocuk yazimlari; uzun surebilir
@ini_set('memory_limit', '256M');

// --dry-run VARSAYILAN; yalnizca ?live=1 ile canli yazar.
$ETL_DRYRUN = (($_GET['live'] ?? '') !== '1');

// Dosya: ?file= mutlak yol; yoksa data/ icindeki ilk *.json.
$ETL_FILE = isset($_GET['file']) ? (string) $_GET['file'] : null;
if ($ETL_FILE === null) {
    $found = glob(dirname(__DIR__) . '/data/*.json') ?: [];
    $ETL_FILE = $found[0] ?? null;
}

header('Content-Type: text/html; charset=utf-8');
echo "<!doctype html><meta charset=utf-8><title>Ozmel ETL</title>";
echo "<body style='background:#111;color:#ddd;font:13px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:18px'>";
echo "<div style='margin-bottom:10px'>Mod: <b style='color:" . ($ETL_DRYRUN ? '#6cf' : '#f96') . "'>"
    . ($ETL_DRYRUN ? 'DRY-RUN — hicbir sey yazilmaz' : 'CANLI — v2 tablolarina yazar')
    . "</b>";
if ($ETL_DRYRUN) {
    echo " &nbsp;|&nbsp; canli calistirmak icin URL'ye <code>&amp;live=1</code> ekleyin";
}
echo " &nbsp;|&nbsp; dosya: " . htmlspecialchars((string) $ETL_FILE, ENT_QUOTES, 'UTF-8') . "</div>";
echo "<pre style='white-space:pre-wrap;word-break:break-word'>";

// etl.php duz metin basar + sonda exit() cagirir. Ciktiyi tampon callback'inden
// gecirerek HTML-escape ederiz; exit'te tampon bu callback ile bosaltilir.
// (<pre> ve baslik ob_start'tan ONCE basildigi icin ham kalir; dogru.)
ob_start(static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8'));
require __DIR__ . '/etl.php';
