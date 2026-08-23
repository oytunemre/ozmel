<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   isEmriNo/woNo   -> woNo / wo_no
 *   orderId         -> orderId (v2_orders.id)
 *   urun            -> productCodeId (v2_product_codes.id)
 *   operasyon       -> operationId  (v2_operations.id)
 *   isMerkezi       -> workCenterId (v2_work_centers.id)
 *   sira            -> sequence
 *   hedefMiktar     -> targetQuantity
 *   durum           -> status
 *   splitEtiket     -> splitLabel
 */
final class WorkOrder
{
    /** FK alanlari (pozitif int ya da null): API camelCase -> DB snake_case. */
    private const FK = [
        'orderId'       => 'order_id',
        'productCodeId' => 'product_code_id',
        'operationId'   => 'operation_id',
        'workCenterId'  => 'work_center_id',
    ];

    public static function fromRow(array $row): array
    {
        return [
            'id'             => (int) $row['id'],
            'woNo'           => (string) $row['wo_no'],
            'orderId'        => $row['order_id'] !== null ? (int) $row['order_id'] : null,
            'productCodeId'  => (int) $row['product_code_id'],
            'operationId'    => $row['operation_id'] !== null ? (int) $row['operation_id'] : null,
            'workCenterId'   => $row['work_center_id'] !== null ? (int) $row['work_center_id'] : null,
            'sequence'       => $row['sequence'] !== null ? (int) $row['sequence'] : null,
            'targetQuantity' => (float) $row['target_quantity'],
            'status'         => (string) $row['status'],
            'splitLabel'     => $row['split_label'] !== null ? (string) $row['split_label'] : null,
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
        if (array_key_exists('woNo', $input)) {
            $out['wo_no'] = trim((string) $input['woNo']);
        }
        foreach (self::FK as $key => $col) {
            if (array_key_exists($key, $input)) {
                $id = (int) $input[$key];
                $out[$col] = $id > 0 ? $id : null;
            }
        }
        if (array_key_exists('sequence', $input)) {
            $val = $input['sequence'];
            $out['sequence'] = ($val === null || (is_string($val) && trim($val) === '')) ? null : (int) $val;
        }
        if (array_key_exists('targetQuantity', $input)) {
            $out['target_quantity'] = (float) $input['targetQuantity'];
        }
        if (array_key_exists('status', $input)) {
            $out['status'] = trim((string) $input['status']);
        }
        if (array_key_exists('splitLabel', $input)) {
            $val = trim((string) $input['splitLabel']);
            $out['split_label'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
