<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   tarih       -> date
 *   isMerkezi   -> workCenterId  (v2_work_centers.id)
 *   urun        -> productCodeId (v2_product_codes.id)
 *   workOrderId -> workOrderId   (v2_work_orders.id)
 *   hedefMiktar -> targetQuantity
 *   not         -> note
 */
final class MachinePlan
{
    public static function fromRow(array $row): array
    {
        return [
            'id'             => (int) $row['id'],
            'date'           => (string) $row['date'],
            'workCenterId'   => (int) $row['work_center_id'],
            'productCodeId'  => (int) $row['product_code_id'],
            'workOrderId'    => $row['work_order_id'] !== null ? (int) $row['work_order_id'] : null,
            'targetQuantity' => $row['target_quantity'] !== null ? (float) $row['target_quantity'] : null,
            'note'           => $row['note'] !== null ? (string) $row['note'] : null,
            'updatedAt'      => (string) $row['updated_at'],
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
        if (array_key_exists('date', $input)) {
            $out['date'] = trim((string) $input['date']);
        }
        if (array_key_exists('workCenterId', $input)) {
            $out['work_center_id'] = (int) $input['workCenterId'];
        }
        if (array_key_exists('productCodeId', $input)) {
            $out['product_code_id'] = (int) $input['productCodeId'];
        }
        if (array_key_exists('workOrderId', $input)) {
            $id = (int) $input['workOrderId'];
            $out['work_order_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('targetQuantity', $input)) {
            $v = $input['targetQuantity'];
            $out['target_quantity'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
        }
        if (array_key_exists('note', $input)) {
            $val = trim((string) $input['note']);
            $out['note'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
