<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari (kod/ad/tip/cizimNo/... ) burada Ingilizce API anahtarlarina
 * ve DB sutunlarina cevrilir — camelCase <-> snake_case sinirinin tek yeri.
 * Ekran metinleri FE'de Turkce kalir.
 *   kod              -> code
 *   ad               -> name
 *   tip              -> type   (Hammadde / Yarı Mamül / Ürün)
 *   cizimNo          -> drawingNo    / drawing_no
 *   revizyon(Tarihi) -> revision / revisionDate
 *   tedarikciler     -> suppliers
 *   cikanOperasyon   -> outgoingOperationId (v1'de operasyon ADI; artik operations.id)
 *   anaUrun          -> parentProductCode
 *
 * v1'de disCap/icCap/... "float veya '' " karisik tipti; API'de sayi ya da null.
 */
final class ProductCode
{
    /** Metin alanlari: API camelCase -> DB snake_case. */
    private const TEXT = [
        'code'              => 'code',
        'name'              => 'name',
        'type'              => 'type',
        'unit'              => 'unit',
        'status'            => 'status',
        'category'          => 'category',
        'drawingNo'         => 'drawing_no',
        'revision'          => 'revision',
        'revisionDate'      => 'revision_date',
        'note'              => 'note',
        'suppliers'         => 'suppliers',
        'customer'          => 'customer',
        'parentProductCode' => 'parent_product_code',
    ];

    /** Sayisal alanlar: DECIMAL(12,3) NULL. Bos string -> NULL. */
    private const DECIMAL = [
        'outerDiameter' => 'outer_diameter',
        'innerDiameter' => 'inner_diameter',
        'materialLength' => 'material_length',
        'materialWeight' => 'material_weight',
        'minStockLevel' => 'min_stock_level',
        'supplyDays'    => 'supply_days',
        'boxQuantity'   => 'box_quantity',
    ];

    public static function fromRow(array $row): array
    {
        return [
            'id'                  => (int) $row['id'],
            'code'                => (string) $row['code'],
            'name'                => (string) $row['name'],
            'type'                => (string) $row['type'],
            'unit'                => self::str($row['unit'] ?? null),
            'status'              => self::str($row['status'] ?? null),
            'category'            => self::str($row['category'] ?? null),
            'drawingNo'           => self::str($row['drawing_no'] ?? null),
            'revision'            => self::str($row['revision'] ?? null),
            'revisionDate'        => self::str($row['revision_date'] ?? null),
            'note'                => self::str($row['note'] ?? null),
            'suppliers'           => self::str($row['suppliers'] ?? null),
            'customer'            => self::str($row['customer'] ?? null),
            'outgoingOperationId' => $row['outgoing_operation_id'] !== null ? (int) $row['outgoing_operation_id'] : null,
            'parentProductCode'   => self::str($row['parent_product_code'] ?? null),
            'outerDiameter'       => self::num($row['outer_diameter'] ?? null),
            'innerDiameter'       => self::num($row['inner_diameter'] ?? null),
            'materialLength'      => self::num($row['material_length'] ?? null),
            'materialWeight'      => self::num($row['material_weight'] ?? null),
            'minStockLevel'       => self::num($row['min_stock_level'] ?? null),
            'supplyDays'          => self::num($row['supply_days'] ?? null),
            'boxQuantity'         => self::num($row['box_quantity'] ?? null),
            'updatedAt'           => (string) $row['updated_at'],
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

        foreach (self::TEXT as $key => $col) {
            if (array_key_exists($key, $input)) {
                $val = trim((string) $input[$key]);
                // Tip disindaki metin alanlarinda bos string -> NULL.
                $out[$col] = ($val === '' && $key !== 'type' && $key !== 'code' && $key !== 'name') ? null : $val;
            }
        }

        foreach (self::DECIMAL as $key => $col) {
            if (array_key_exists($key, $input)) {
                $out[$col] = self::toDecimal($input[$key]);
            }
        }

        if (array_key_exists('outgoingOperationId', $input)) {
            $id = (int) $input['outgoingOperationId'];
            $out['outgoing_operation_id'] = $id > 0 ? $id : null;
        }

        return $out;
    }

    /** Sayisal alanlarin API anahtarlari — Validator ve Controller paylasir. */
    public static function decimalKeys(): array
    {
        return array_keys(self::DECIMAL);
    }

    /** Bos string / null -> NULL; aksi halde float. */
    private static function toDecimal(mixed $v): ?float
    {
        if ($v === null || (is_string($v) && trim($v) === '')) {
            return null;
        }
        return (float) $v;
    }

    private static function str(mixed $v): ?string
    {
        return $v === null ? null : (string) $v;
    }

    private static function num(mixed $v): ?float
    {
        return $v === null ? null : (float) $v;
    }
}
