<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   parentId               -> parentId / parent_id (oz-referans)
 *   kod                    -> productCodeId  (v2_product_codes.id)
 *   malzemeKodu            -> materialCodeId  (v2_product_codes.id, Hammadde)
 *   malzemeAciklama        -> materialDescription
 *   aciklama               -> description
 *   revNo / revTarihi      -> revision / revisionDate
 *   birimMiktar            -> unitQuantity
 *   disCap / icCap         -> outerDiameter / innerDiameter
 *   hammaddeUzunluk/Agirlik-> materialLength / materialWeight
 *   parcaBoyu              -> partLength
 *   kesimKaybi             -> cutLoss
 *   tedarikciKesimUzunlugu -> supplierCutLength
 */
final class ProductTree
{
    /** Metin alanlari: API camelCase -> DB snake_case. */
    private const TEXT = [
        'materialDescription' => 'material_description',
        'description'         => 'description',
        'revision'            => 'revision',
        'revisionDate'        => 'revision_date',
    ];

    /** FK alanlari (pozitif int ya da null): API camelCase -> DB snake_case. */
    private const FK = [
        'parentId'       => 'parent_id',
        'productCodeId'  => 'product_code_id',
        'materialCodeId' => 'material_code_id',
    ];

    /** Sayisal alanlar: DECIMAL(12,3) NULL. Bos string -> NULL. */
    private const DECIMAL = [
        'unitQuantity'      => 'unit_quantity',
        'outerDiameter'     => 'outer_diameter',
        'innerDiameter'     => 'inner_diameter',
        'materialLength'    => 'material_length',
        'materialWeight'    => 'material_weight',
        'partLength'        => 'part_length',
        'cutLoss'           => 'cut_loss',
        'supplierCutLength' => 'supplier_cut_length',
    ];

    public static function fromRow(array $row): array
    {
        $out = [
            'id'                  => (int) $row['id'],
            'parentId'            => $row['parent_id'] !== null ? (int) $row['parent_id'] : null,
            'productCodeId'       => (int) $row['product_code_id'],
            'materialCodeId'      => $row['material_code_id'] !== null ? (int) $row['material_code_id'] : null,
            'materialDescription' => self::str($row['material_description'] ?? null),
            'description'         => self::str($row['description'] ?? null),
            'revision'            => self::str($row['revision'] ?? null),
            'revisionDate'        => self::str($row['revision_date'] ?? null),
        ];
        foreach (self::DECIMAL as $key => $col) {
            $out[$key] = $row[$col] !== null ? (float) $row[$col] : null;
        }
        $out['updatedAt'] = (string) $row['updated_at'];
        return $out;
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
                $out[$col] = $val === '' ? null : $val;
            }
        }

        foreach (self::FK as $key => $col) {
            if (array_key_exists($key, $input)) {
                $id = (int) $input[$key];
                $out[$col] = $id > 0 ? $id : null;
            }
        }

        foreach (self::DECIMAL as $key => $col) {
            if (array_key_exists($key, $input)) {
                $out[$col] = self::toDecimal($input[$key]);
            }
        }

        return $out;
    }

    /** Sayisal alanlarin API anahtarlari — Validator paylasir. */
    public static function decimalKeys(): array
    {
        return array_keys(self::DECIMAL);
    }

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
}
