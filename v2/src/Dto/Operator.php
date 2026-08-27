<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari (adSoyad/sicilNo/durum/yetkinOperasyonlar) burada Ingilizce
 * API anahtarlarina ve DB sutunlarina cevrilir — camelCase <-> snake_case
 * sinirinin tek yeri. Ekran metinleri FE'de t() ile Turkce kalir.
 *   adSoyad             -> fullName / full_name
 *   sicilNo             -> badgeNo  / badge_no
 *   durum (Aktif/Pasif) -> isActive / is_active (bool)
 *   yetkinOperasyonlar  -> skills   (cocuk tablo: operator_skills; operasyon
 *                                    ID dizisi -> operations.id)
 */
final class Operator
{
    public static function fromRow(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'fullName'  => (string) $row['full_name'],
            'badgeNo'   => (string) $row['badge_no'],
            'isActive'  => (bool) $row['is_active'],
            'skills'    => array_map('intval', $row['skills'] ?? []),
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    /** Istemci JSON'undan ana tablo sutunlarina. Yetkinlikler ayri (toSkills). */
    public static function toColumns(array $input): array
    {
        $out = [];
        if (array_key_exists('fullName', $input)) {
            $out['full_name'] = trim((string) $input['fullName']);
        }
        if (array_key_exists('badgeNo', $input)) {
            $out['badge_no'] = trim((string) $input['badgeNo']);
        }
        if (array_key_exists('isActive', $input)) {
            $out['is_active'] = $input['isActive'] ? 1 : 0;
        }
        return $out;
    }

    /**
     * Yetkin operasyon id'leri (cocuk tabloya gidecek). Tekillestirilir.
     * `skills` anahtari YOKSA null doner — guncellemede "yetkinlige dokunma" demektir.
     * Varsa (bos dizi bile) mevcut yetkinlikler bununla degistirilir.
     *
     * @return list<int>|null
     */
    public static function toSkills(array $input): ?array
    {
        if (!array_key_exists('skills', $input)) {
            return null;
        }
        if (!is_array($input['skills'])) {
            return [];
        }
        $clean = [];
        foreach ($input['skills'] as $s) {
            $id = (int) $s;
            if ($id > 0 && !in_array($id, $clean, true)) {
                $clean[] = $id;
            }
        }
        return $clean;
    }
}
