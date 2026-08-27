<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   urun          -> productCodeId (product_codes.id)
 *   operasyon     -> operationId   (operations.id)
 *   no            -> pointNo
 *   karakteristik -> characteristic
 *   tip           -> type (olcusel / nitel)
 *   nominal/altLimit/ustLimit -> nominal / lowerLimit / upperLimit
 *   birim         -> unit
 */
final class FirstOffPoint
{
    /** Sayisal alanlar: DECIMAL(12,4) NULL. Bos string -> NULL. */
    private const DECIMAL = [
        'nominal'    => 'nominal',
        'lowerLimit' => 'lower_limit',
        'upperLimit' => 'upper_limit',
    ];

    public static function fromRow(array $row): array
    {
        return [
            'id'             => (int) $row['id'],
            'productCodeId'  => (int) $row['product_code_id'],
            'operationId'    => (int) $row['operation_id'],
            'pointNo'        => (int) $row['point_no'],
            'characteristic' => (string) $row['characteristic'],
            'type'           => (string) $row['type'],
            'nominal'        => $row['nominal'] !== null ? (float) $row['nominal'] : null,
            'lowerLimit'     => $row['lower_limit'] !== null ? (float) $row['lower_limit'] : null,
            'upperLimit'     => $row['upper_limit'] !== null ? (float) $row['upper_limit'] : null,
            'unit'           => $row['unit'] !== null ? (string) $row['unit'] : null,
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
        if (array_key_exists('productCodeId', $input)) {
            $out['product_code_id'] = (int) $input['productCodeId'];
        }
        if (array_key_exists('operationId', $input)) {
            $out['operation_id'] = (int) $input['operationId'];
        }
        if (array_key_exists('pointNo', $input)) {
            $out['point_no'] = (int) $input['pointNo'];
        }
        if (array_key_exists('characteristic', $input)) {
            $out['characteristic'] = trim((string) $input['characteristic']);
        }
        if (array_key_exists('type', $input)) {
            $out['type'] = trim((string) $input['type']);
        }
        foreach (self::DECIMAL as $key => $col) {
            if (array_key_exists($key, $input)) {
                $v = $input[$key];
                $out[$col] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
            }
        }
        if (array_key_exists('unit', $input)) {
            $val = trim((string) $input['unit']);
            $out['unit'] = $val === '' ? null : $val;
        }
        return $out;
    }

    /** Sayisal alanlarin API anahtarlari — Validator paylasir. */
    public static function decimalKeys(): array
    {
        return array_keys(self::DECIMAL);
    }
}
