<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 satinalmaIstekleri alan adlari -> Ingilizce API/DB. Malzeme artik FK
 * (materialCodeId); tanim ayri tutulmaz, v2_product_codes.name'den JOIN ile gelir.
 *   malzeme       -> materialCodeId (v2_product_codes.id, NOT NULL)
 *   urun          -> productCodeId  (v2_product_codes.id, opsiyonel)
 *   miktar        -> quantity
 *   birim         -> unit
 *   tedarikci     -> supplier
 *   istekTarihi   -> requestDate
 *   beklenenTarih -> expectedDate
 *   siparis       -> orderId (v2_orders.id, opsiyonel)
 *   not           -> note
 */
final class PurchaseRequest
{
    public static function fromRow(array $row): array
    {
        return [
            'id'             => (int) $row['id'],
            'materialCodeId' => (int) $row['material_code_id'],
            'productCodeId'  => $row['product_code_id'] !== null ? (int) $row['product_code_id'] : null,
            'quantity'       => $row['quantity'] !== null ? (float) $row['quantity'] : null,
            'unit'           => $row['unit'] !== null ? (string) $row['unit'] : null,
            'supplier'       => $row['supplier'] !== null ? (string) $row['supplier'] : null,
            'requestDate'    => $row['request_date'] !== null ? (string) $row['request_date'] : null,
            'expectedDate'   => $row['expected_date'] !== null ? (string) $row['expected_date'] : null,
            'orderId'        => $row['order_id'] !== null ? (int) $row['order_id'] : null,
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
        if (array_key_exists('materialCodeId', $input)) {
            $out['material_code_id'] = (int) $input['materialCodeId'];
        }
        if (array_key_exists('productCodeId', $input)) {
            $id = (int) $input['productCodeId'];
            $out['product_code_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('quantity', $input)) {
            $v = $input['quantity'];
            $out['quantity'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
        }
        if (array_key_exists('unit', $input)) {
            $val = trim((string) $input['unit']);
            $out['unit'] = $val === '' ? null : $val;
        }
        if (array_key_exists('supplier', $input)) {
            $val = trim((string) $input['supplier']);
            $out['supplier'] = $val === '' ? null : $val;
        }
        if (array_key_exists('requestDate', $input)) {
            $val = trim((string) $input['requestDate']);
            $out['request_date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('expectedDate', $input)) {
            $val = trim((string) $input['expectedDate']);
            $out['expected_date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('orderId', $input)) {
            $id = (int) $input['orderId'];
            $out['order_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('note', $input)) {
            $val = trim((string) $input['note']);
            $out['note'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
