<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOException;
use RuntimeException;

/**
 * Tek PDO baglantisi + transaction yardimcisi.
 * config.php v1 ile ayni formatta: ['db_host','db_name','db_user','db_pass'].
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $config = require dirname(__DIR__, 2) . '/config.php';

        try {
            self::$pdo = new PDO(
                "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4",
                $config['db_user'],
                $config['db_pass'],
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
        } catch (PDOException) {
            throw new RuntimeException('Veritabani baglanti hatasi');
        }

        return self::$pdo;
    }

    /**
     * Callback'i transaction icinde calistirir. Hata olursa geri alir.
     * Birden fazla tabloya yazan islemler icin (siparis + is emirleri gibi).
     *
     * REENTRANT: zaten acik bir transaction varsa yenisini ACMAZ, dis transaction'a
     * KATILIR (callback'i dogrudan calistirir). Boylece ic ice cagrilar (or. ETL bir
     * koleksiyonu transaction'a alir, iceride updateWithSkills yine transaction ister)
     * "zaten aktif transaction" hatasi vermez; commit/rollback en distaki cagriya kalir.
     */
    public static function transaction(callable $fn): mixed
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) {
            return $fn($pdo);
        }

        $pdo->beginTransaction();
        try {
            $result = $fn($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
