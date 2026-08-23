<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   satinalmaGirisIdleri -> legacyPurchaseReceiptId (ETL eslesme icin CHAR(16) metin, korunur)
 *                        -> purchaseReceiptId (v2_purchase_receipts.id FK; 025 ile eklendi)
 *   tedarikci            -> supplier
 *   malzeme              -> materialCodeId (v2_product_codes.id)
 *   cizimNo              -> drawingNo
 *   gozlemNedeni         -> reason
 *   malzemeGelisTarihi   -> arrivalDate
 *   kontrolTarihi        -> inspectionDate
 *   gelenAdet            -> receivedQty
 *   ornekAdedi           -> sampleQty
 *   kontrolEden          -> inspectorName (isim, FK degil)
 *   genelSonuc           -> overallResult
 *   karakteristikler[]   -> characteristics (seviye 1; her biri values[] ile seviye 2)
 *
 * characteristics sekli: [{charNo, name, specText, type, nominal, lowerLimit,
 * upperLimit, unit, values:[deger,...]}].
 *
 * values dizisi v1'deki gibi KARISIK olabilir: sayi (olcusel olcum) ya da metin
 * ('Uygun'/'Uygun Değil' — nitel sonuc). DB'de sayilar `value`, metinler `result`
 * sutununa ayrilir; okurken tek diziye geri birlestirilir (API sekli v1'e uygun kalir).
 */
final class IncomingInspection
{
    /** Karakteristik sayisal alanlari: DECIMAL(12,4) NULL. */
    private const CHAR_DECIMAL = [
        'nominal'    => 'nominal',
        'lowerLimit' => 'lower_limit',
        'upperLimit' => 'upper_limit',
    ];

    public static function fromRow(array $row): array
    {
        return [
            'id'                => (int) $row['id'],
            'legacyPurchaseReceiptId' => $row['legacy_purchase_receipt_id'] !== null ? (string) $row['legacy_purchase_receipt_id'] : null,
            'purchaseReceiptId' => $row['purchase_receipt_id'] !== null ? (int) $row['purchase_receipt_id'] : null,
            'supplier'          => $row['supplier'] !== null ? (string) $row['supplier'] : null,
            'materialCodeId'    => $row['material_code_id'] !== null ? (int) $row['material_code_id'] : null,
            'drawingNo'         => $row['drawing_no'] !== null ? (string) $row['drawing_no'] : null,
            'reason'            => $row['reason'] !== null ? (string) $row['reason'] : null,
            'arrivalDate'       => $row['arrival_date'] !== null ? (string) $row['arrival_date'] : null,
            'inspectionDate'    => $row['inspection_date'] !== null ? (string) $row['inspection_date'] : null,
            'receivedQty'       => $row['received_qty'] !== null ? (float) $row['received_qty'] : null,
            'sampleQty'         => $row['sample_qty'] !== null ? (int) $row['sample_qty'] : null,
            'inspectorName'     => $row['inspector_name'] !== null ? (string) $row['inspector_name'] : null,
            'overallResult'     => $row['overall_result'] !== null ? (string) $row['overall_result'] : null,
            'characteristics'   => self::characteristicsFromRows($row['characteristics'] ?? []),
            'updatedAt'         => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    /** Ana tablo sutunlari. Karakteristikler ayri (toCharacteristics). */
    public static function toColumns(array $input): array
    {
        $out = [];
        if (array_key_exists('legacyPurchaseReceiptId', $input)) {
            $val = trim((string) $input['legacyPurchaseReceiptId']);
            $out['legacy_purchase_receipt_id'] = $val === '' ? null : $val;
        }
        if (array_key_exists('purchaseReceiptId', $input)) {
            $id = (int) $input['purchaseReceiptId'];
            $out['purchase_receipt_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('supplier', $input)) {
            $val = trim((string) $input['supplier']);
            $out['supplier'] = $val === '' ? null : $val;
        }
        if (array_key_exists('materialCodeId', $input)) {
            $id = (int) $input['materialCodeId'];
            $out['material_code_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('drawingNo', $input)) {
            $val = trim((string) $input['drawingNo']);
            $out['drawing_no'] = $val === '' ? null : $val;
        }
        if (array_key_exists('reason', $input)) {
            $val = trim((string) $input['reason']);
            $out['reason'] = $val === '' ? null : $val;
        }
        if (array_key_exists('arrivalDate', $input)) {
            $val = trim((string) $input['arrivalDate']);
            $out['arrival_date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('inspectionDate', $input)) {
            $val = trim((string) $input['inspectionDate']);
            $out['inspection_date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('receivedQty', $input)) {
            $v = $input['receivedQty'];
            $out['received_qty'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
        }
        if (array_key_exists('sampleQty', $input)) {
            $v = $input['sampleQty'];
            $out['sample_qty'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (int) $v;
        }
        if (array_key_exists('inspectorName', $input)) {
            $val = trim((string) $input['inspectorName']);
            $out['inspector_name'] = $val === '' ? null : $val;
        }
        if (array_key_exists('overallResult', $input)) {
            $val = trim((string) $input['overallResult']);
            $out['overall_result'] = $val === '' ? null : $val;
        }
        return $out;
    }

    /**
     * Karakteristikler + her birinin degerleri. `characteristics` anahtari YOKSA
     * null ("dokunma"). Her eleman: {cols: seviye1 sutunlari, values: seviye2 deger listesi}.
     *
     * Her deger tipine gore ayrilir: sayisalsa {value, result:null}, bos olmayan
     * metinse {value:null, result}; bos/null ise ikisi de null.
     *
     * @return list<array{cols: array, values: list<array{value:?float,result:?string}>}>|null
     */
    public static function toCharacteristics(array $input): ?array
    {
        if (!array_key_exists('characteristics', $input)) {
            return null;
        }
        if (!is_array($input['characteristics'])) {
            return [];
        }
        $out = [];
        foreach ($input['characteristics'] as $c) {
            if (!is_array($c)) {
                continue;
            }
            $cols = [
                'char_no'   => (int) ($c['charNo'] ?? 0),
                'name'      => trim((string) ($c['name'] ?? '')),
                'spec_text' => self::nullableStr($c['specText'] ?? null),
                'type'      => trim((string) ($c['type'] ?? '')),
                'unit'      => self::nullableStr($c['unit'] ?? null),
            ];
            foreach (self::CHAR_DECIMAL as $key => $col) {
                $v = $c[$key] ?? null;
                $cols[$col] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
            }

            $values = [];
            foreach ((is_array($c['values'] ?? null) ? $c['values'] : []) as $v) {
                // Tipe gore ayir: sayi -> value, metin -> result (nitel 'Uygun' vb.).
                if ($v === null || (is_string($v) && trim($v) === '')) {
                    $values[] = ['value' => null, 'result' => null];
                } elseif (is_numeric($v)) {
                    $values[] = ['value' => (float) $v, 'result' => null];
                } else {
                    $values[] = ['value' => null, 'result' => trim((string) $v)];
                }
            }

            $out[] = ['cols' => $cols, 'values' => $values];
        }
        return $out;
    }

    /** Karakteristik sayisal alanlarinin API anahtarlari — Validator paylasir. */
    public static function charDecimalKeys(): array
    {
        return array_keys(self::CHAR_DECIMAL);
    }

    /** DB satirlarindan (her karakteristik 'values' ile) API sekli. */
    private static function characteristicsFromRows(array $rows): array
    {
        return array_map(static fn(array $c): array => [
            'id'         => (int) $c['id'],
            'charNo'     => (int) $c['char_no'],
            'name'       => (string) $c['name'],
            'specText'   => $c['spec_text'] !== null ? (string) $c['spec_text'] : null,
            'type'       => (string) $c['type'],
            'nominal'    => $c['nominal'] !== null ? (float) $c['nominal'] : null,
            'lowerLimit' => $c['lower_limit'] !== null ? (float) $c['lower_limit'] : null,
            'upperLimit' => $c['upper_limit'] !== null ? (float) $c['upper_limit'] : null,
            'unit'       => $c['unit'] !== null ? (string) $c['unit'] : null,
            // Tek diziye birlestir (v1 sekli): metin sonuc varsa onu, yoksa sayiyi ver.
            'values'     => array_map(
                static fn(array $v): float|string|null =>
                    $v['result'] !== null ? (string) $v['result']
                        : ($v['value'] !== null ? (float) $v['value'] : null),
                $c['values'] ?? []
            ),
        ], $rows);
    }

    private static function nullableStr(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }
}
