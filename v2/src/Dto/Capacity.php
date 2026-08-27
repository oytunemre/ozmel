<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri.
 *   urun      -> productCodeId    (product_codes.id)
 *   isMerkezi -> workCenterId     (work_centers.id)
 *   kapasite  -> capacityPerShift (vardiya basi)
 *   dakika    -> minutes (opsiyonel)
 */
final class Capacity
{
    public static function fromRow(array $row): array
    {
        return [
            'id'               => (int) $row['id'],
            'productCodeId'    => (int) $row['product_code_id'],
            'workCenterId'     => (int) $row['work_center_id'],
            'capacityPerShift' => (float) $row['capacity_per_shift'],
            'minutes'          => $row['minutes'] !== null ? (float) $row['minutes'] : null,
            'updatedAt'        => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    /** Istemci JSON'undan DB sutunlarina. camelCase -> snake_case sinirinin tek yeri. */
    public static function toColumns(array $input): array
    {
        $out = [];
        if (array_key_exists('productCodeId', $input)) {
            $out['product_code_id'] = (int) $input['productCodeId'];
        }
        if (array_key_exists('workCenterId', $input)) {
            $out['work_center_id'] = (int) $input['workCenterId'];
        }
        if (array_key_exists('capacityPerShift', $input)) {
            $out['capacity_per_shift'] = (float) $input['capacityPerShift'];
        }
        if (array_key_exists('minutes', $input)) {
            // Bos string / null -> NULL (opsiyonel).
            $v = $input['minutes'];
            $out['minutes'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
        }
        return $out;
    }
}
