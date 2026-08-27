<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   urun               -> productCodeId (product_codes.id)
 *   operasyon          -> operationId   (operations.id)
 *   isMerkezi          -> workCenterId  (work_centers.id)
 *   sira               -> sequence
 *   aktif              -> isActive
 *   varyantEtiketi     -> variantLabel
 *   varyantSecenekleri -> variants (cocuk tablo: route_variants; string dizisi)
 */
final class Route
{
    public static function fromRow(array $row): array
    {
        return [
            'id'            => (int) $row['id'],
            'productCodeId' => (int) $row['product_code_id'],
            'operationId'   => (int) $row['operation_id'],
            'workCenterId'  => (int) $row['work_center_id'],
            'sequence'      => (int) $row['sequence'],
            'isActive'      => (bool) $row['is_active'],
            'variantLabel'  => $row['variant_label'] !== null ? (string) $row['variant_label'] : null,
            'variants'      => array_values(array_map('strval', $row['variants'] ?? [])),
            'updatedAt'     => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    /** Istemci JSON'undan ana tablo sutunlarina. Varyantlar ayri (toVariants). */
    public static function toColumns(array $input): array
    {
        $out = [];
        if (array_key_exists('productCodeId', $input)) {
            $out['product_code_id'] = (int) $input['productCodeId'];
        }
        if (array_key_exists('operationId', $input)) {
            $out['operation_id'] = (int) $input['operationId'];
        }
        if (array_key_exists('workCenterId', $input)) {
            $out['work_center_id'] = (int) $input['workCenterId'];
        }
        if (array_key_exists('sequence', $input)) {
            $out['sequence'] = (int) $input['sequence'];
        }
        if (array_key_exists('isActive', $input)) {
            $out['is_active'] = $input['isActive'] ? 1 : 0;
        }
        if (array_key_exists('variantLabel', $input)) {
            $val = trim((string) $input['variantLabel']);
            $out['variant_label'] = $val === '' ? null : $val;
        }
        return $out;
    }

    /**
     * Varyant secenekleri (cocuk tabloya gidecek). Kirpilir, tekillestirilir, bos atilir.
     * `variants` anahtari YOKSA null doner — guncellemede "varyantlara dokunma" demektir.
     * Varsa (bos dizi bile) mevcut varyantlar bununla degistirilir.
     *
     * @return list<string>|null
     */
    public static function toVariants(array $input): ?array
    {
        if (!array_key_exists('variants', $input)) {
            return null;
        }
        if (!is_array($input['variants'])) {
            return [];
        }
        $clean = [];
        foreach ($input['variants'] as $v) {
            $val = trim((string) $v);
            if ($val !== '' && !in_array($val, $clean, true)) {
                $clean[] = $val;
            }
        }
        return $clean;
    }
}
