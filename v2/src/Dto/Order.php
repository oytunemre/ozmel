<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   orderNo               -> orderNo / order_no
 *   kaynak                -> source (satis / stok)
 *   durum                 -> status
 *   musteri               -> customer
 *   satisSiparisNo        -> salesOrderNo
 *   urun                  -> productCodeId (v2_product_codes.id)
 *   hedefMiktar           -> targetQuantity
 *   baslangicTarihi       -> startDate
 *   istenenTeslimTarihi   -> requestedDeliveryDate
 *   not                   -> note
 */
final class Order
{
    public static function fromRow(array $row): array
    {
        return [
            'id'                    => (int) $row['id'],
            'orderNo'               => (string) $row['order_no'],
            'source'                => (string) $row['source'],
            'status'                => (string) $row['status'],
            'customer'              => $row['customer'] !== null ? (string) $row['customer'] : null,
            'salesOrderNo'          => $row['sales_order_no'] !== null ? (string) $row['sales_order_no'] : null,
            'productCodeId'         => (int) $row['product_code_id'],
            'targetQuantity'        => (float) $row['target_quantity'],
            'startDate'             => $row['start_date'] !== null ? (string) $row['start_date'] : null,
            'requestedDeliveryDate' => $row['requested_delivery_date'] !== null ? (string) $row['requested_delivery_date'] : null,
            'note'                  => $row['note'] !== null ? (string) $row['note'] : null,
            'updatedAt'             => (string) $row['updated_at'],
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
        if (array_key_exists('orderNo', $input)) {
            $out['order_no'] = trim((string) $input['orderNo']);
        }
        if (array_key_exists('source', $input)) {
            $out['source'] = trim((string) $input['source']);
        }
        if (array_key_exists('status', $input)) {
            $out['status'] = trim((string) $input['status']);
        }
        if (array_key_exists('customer', $input)) {
            $val = trim((string) $input['customer']);
            $out['customer'] = $val === '' ? null : $val;
        }
        if (array_key_exists('salesOrderNo', $input)) {
            $val = trim((string) $input['salesOrderNo']);
            $out['sales_order_no'] = $val === '' ? null : $val;
        }
        if (array_key_exists('productCodeId', $input)) {
            $out['product_code_id'] = (int) $input['productCodeId'];
        }
        if (array_key_exists('targetQuantity', $input)) {
            $out['target_quantity'] = (float) $input['targetQuantity'];
        }
        if (array_key_exists('startDate', $input)) {
            $val = trim((string) $input['startDate']);
            $out['start_date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('requestedDeliveryDate', $input)) {
            $val = trim((string) $input['requestedDeliveryDate']);
            $out['requested_delivery_date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('note', $input)) {
            $val = trim((string) $input['note']);
            $out['note'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
