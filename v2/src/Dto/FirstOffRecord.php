<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   urun         -> productCodeId (product_codes.id)
 *   operasyon    -> operationId   (operations.id)
 *   tarih        -> date
 *   vardiya      -> shift
 *   operator     -> operatorName (ISIM metni, FK degil)
 *   isEmriNo     -> woNo
 *   numuneAdedi  -> sampleCount
 *   kontrolSaati -> checkTime
 *   genelKarar   -> overallResult
 *   degerler{}   -> measurements (cocuk: first_off_measurements; {pointId,value,result})
 *   gerekce[]    -> reasons      (cocuk: first_off_reasons; string dizisi)
 */
final class FirstOffRecord
{
    public static function fromRow(array $row): array
    {
        return [
            'id'            => (int) $row['id'],
            'productCodeId' => (int) $row['product_code_id'],
            'operationId'   => (int) $row['operation_id'],
            'date'          => (string) $row['date'],
            'shift'         => (string) $row['shift'],
            'operatorName'  => $row['operator_name'] !== null ? (string) $row['operator_name'] : null,
            'woNo'          => $row['wo_no'] !== null ? (string) $row['wo_no'] : null,
            'sampleCount'   => $row['sample_count'] !== null ? (int) $row['sample_count'] : null,
            'checkTime'     => self::hhmm($row['check_time'] ?? null),
            'overallResult' => $row['overall_result'] !== null ? (string) $row['overall_result'] : null,
            'measurements'  => self::measurementsFromRows($row['measurements'] ?? []),
            'reasons'       => array_values(array_map('strval', $row['reasons'] ?? [])),
            'updatedAt'     => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    /** Ana tablo sutunlari. Cocuklar ayri (toMeasurements / toReasons). */
    public static function toColumns(array $input): array
    {
        $out = [];
        if (array_key_exists('productCodeId', $input)) {
            $out['product_code_id'] = (int) $input['productCodeId'];
        }
        if (array_key_exists('operationId', $input)) {
            $out['operation_id'] = (int) $input['operationId'];
        }
        if (array_key_exists('date', $input)) {
            $out['date'] = trim((string) $input['date']);
        }
        if (array_key_exists('shift', $input)) {
            $out['shift'] = trim((string) $input['shift']);
        }
        if (array_key_exists('operatorName', $input)) {
            $val = trim((string) $input['operatorName']);
            $out['operator_name'] = $val === '' ? null : $val;
        }
        if (array_key_exists('woNo', $input)) {
            $val = trim((string) $input['woNo']);
            $out['wo_no'] = $val === '' ? null : $val;
        }
        if (array_key_exists('sampleCount', $input)) {
            $v = $input['sampleCount'];
            $out['sample_count'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (int) $v;
        }
        if (array_key_exists('checkTime', $input)) {
            $val = trim((string) $input['checkTime']);
            $out['check_time'] = $val === '' ? null : $val;
        }
        if (array_key_exists('overallResult', $input)) {
            $val = trim((string) $input['overallResult']);
            $out['overall_result'] = $val === '' ? null : $val;
        }
        return $out;
    }

    /**
     * Olcumler (cocuk tabloya). `measurements` anahtari YOKSA null ("dokunma").
     * Varsa her eleman {point_id, value, result}; point_id tekillestirilir (son kazanir).
     *
     * @return list<array{point_id:int,value:?float,result:?string}>|null
     */
    public static function toMeasurements(array $input): ?array
    {
        if (!array_key_exists('measurements', $input)) {
            return null;
        }
        if (!is_array($input['measurements'])) {
            return [];
        }
        $byPoint = [];
        foreach ($input['measurements'] as $m) {
            if (!is_array($m)) {
                continue;
            }
            $pointId = (int) ($m['pointId'] ?? 0);
            if ($pointId <= 0) {
                continue;
            }
            $value  = $m['value'] ?? null;
            $result = array_key_exists('result', $m) ? trim((string) $m['result']) : '';
            $byPoint[$pointId] = [
                'point_id' => $pointId,
                'value'    => ($value === null || (is_string($value) && trim($value) === '')) ? null : (float) $value,
                'result'   => $result === '' ? null : $result,
            ];
        }
        return array_values($byPoint);
    }

    /**
     * Gerekceler (cocuk tabloya). `reasons` anahtari YOKSA null ("dokunma").
     * @return list<string>|null
     */
    public static function toReasons(array $input): ?array
    {
        if (!array_key_exists('reasons', $input)) {
            return null;
        }
        if (!is_array($input['reasons'])) {
            return [];
        }
        $clean = [];
        foreach ($input['reasons'] as $r) {
            $val = trim((string) $r);
            if ($val !== '' && !in_array($val, $clean, true)) {
                $clean[] = $val;
            }
        }
        return $clean;
    }

    /** DB satirlarindan API olcum sekli. */
    private static function measurementsFromRows(array $rows): array
    {
        return array_map(static fn(array $r): array => [
            'pointId' => (int) $r['point_id'],
            'value'   => $r['value'] !== null ? (float) $r['value'] : null,
            'result'  => $r['result'] !== null ? (string) $r['result'] : null,
        ], $rows);
    }

    /** TIME sutunu 'HH:MM:SS' doner; API'de 'HH:MM'. Null ise null. */
    private static function hhmm(mixed $time): ?string
    {
        if ($time === null) {
            return null;
        }
        $t = (string) $time;
        return preg_match('/^\d{2}:\d{2}:\d{2}$/', $t) ? substr($t, 0, 5) : $t;
    }
}
