<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 satinalmaGirisleri: malzemeyi kendisi tutmazdi (istek uzerinden gelir).
 *   (istek)  -> purchaseRequestId (v2_purchase_requests.id)
 *   tarih    -> date
 *   miktar   -> quantity
 *   not      -> note
 */
final class PurchaseReceipt
{
    public static function fromRow(array $row): array
    {
        return [
            'id'                => (int) $row['id'],
            'purchaseRequestId' => (int) $row['purchase_request_id'],
            'date'              => $row['date'] !== null ? (string) $row['date'] : null,
            'quantity'          => $row['quantity'] !== null ? (float) $row['quantity'] : null,
            'note'              => $row['note'] !== null ? (string) $row['note'] : null,
            'updatedAt'         => (string) $row['updated_at'],
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
        if (array_key_exists('purchaseRequestId', $input)) {
            $out['purchase_request_id'] = (int) $input['purchaseRequestId'];
        }
        if (array_key_exists('date', $input)) {
            $val = trim((string) $input['date']);
            $out['date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('quantity', $input)) {
            $v = $input['quantity'];
            $out['quantity'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
        }
        if (array_key_exists('note', $input)) {
            $val = trim((string) $input['note']);
            $out['note'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
