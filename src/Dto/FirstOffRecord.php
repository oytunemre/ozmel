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
 *   degerler{}   -> measurements (cocuk: first_off_measurements). NOKTA BASINA COK NUMUNE:
 *                   {pointId, values:[karisik...]} — her numune sayi (olcusel) ya da
 *                   'Uygun'/'Uygun Değil' (nitel). DB'de her numune ayri satir (sequence).
 *                   Geriye donuk: fromRow ayrica ilk numuneyi value/result olarak da verir.
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
            'note'          => array_key_exists('note', $row) && $row['note'] !== null ? (string) $row['note'] : null,
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
        if (array_key_exists('note', $input)) {
            $val = trim((string) $input['note']);
            $out['note'] = $val === '' ? null : $val;
        }
        return $out;
    }

    /**
     * Olcumler (cocuk tabloya). `measurements` anahtari YOKSA null ("dokunma").
     * Her nokta icin {pointId, values:[karisik...]} bekler (numune basina ayri satir).
     * Geriye donuk: eski {pointId, value, result} tek-numune sekli de kabul edilir.
     * Her numune: sayi -> value sutunu, metin ('Uygun'/'Uygun Değil') -> result sutunu.
     *
     * @return list<array{point_id:int,sequence:int,value:?float,result:?string}>|null
     */
    public static function toMeasurements(array $input): ?array
    {
        if (!array_key_exists('measurements', $input)) {
            return null;
        }
        if (!is_array($input['measurements'])) {
            return [];
        }
        $out = [];
        $seen = [];   // "point|seq" -> son kazanir
        $push = static function (int $pointId, int $seq, mixed $sample) use (&$out, &$seen): void {
            $isEmpty = $sample === null || (is_string($sample) && trim($sample) === '');
            $numeric = !$isEmpty && is_numeric($sample);
            $key = $pointId . '|' . $seq;
            $seen[$key] = [
                'point_id' => $pointId,
                'sequence' => $seq,
                'value'    => $numeric ? (float) $sample : null,
                'result'   => (!$isEmpty && !$numeric) ? trim((string) $sample) : null,
            ];
        };
        foreach ($input['measurements'] as $m) {
            if (!is_array($m)) {
                continue;
            }
            $pointId = (int) ($m['pointId'] ?? 0);
            if ($pointId <= 0) {
                continue;
            }
            if (array_key_exists('values', $m) && is_array($m['values'])) {
                $i = 0;
                foreach ($m['values'] as $sample) { $push($pointId, $i, $sample); $i++; }
            } else {
                // Eski tek-numune sekli: value ya da result.
                $legacy = array_key_exists('value', $m) && $m['value'] !== null && $m['value'] !== ''
                    ? $m['value'] : ($m['result'] ?? null);
                $push($pointId, 0, $legacy);
            }
        }
        // Bos numuneleri (value ve result null) atma — yalnizca dolu satirlar yazilir.
        foreach ($seen as $row) {
            if ($row['value'] !== null || $row['result'] !== null) $out[] = $row;
        }
        return $out;
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

    /**
     * DB satirlarindan API olcum sekli. Nokta basina numuneler `values` dizisinde
     * (sequence sirasi; sayi->value, metin->result). Geriye donuk uyum icin ilk
     * numune ayrica value/result olarak da verilir (eski First-Off ekrani icin).
     * Satirlar Repository'de point_id, sequence sirali gelir.
     */
    private static function measurementsFromRows(array $rows): array
    {
        $byPoint = [];
        foreach ($rows as $r) {
            $pid = (int) $r['point_id'];
            if (!isset($byPoint[$pid])) {
                $byPoint[$pid] = ['pointId' => $pid, 'values' => [], 'value' => null, 'result' => null];
            }
            $sample = $r['value'] !== null ? (float) $r['value']
                : ($r['result'] !== null ? (string) $r['result'] : null);
            $byPoint[$pid]['values'][] = $sample;
            if ($byPoint[$pid]['value'] === null && $byPoint[$pid]['result'] === null) {
                $byPoint[$pid]['value']  = $r['value'] !== null ? (float) $r['value'] : null;
                $byPoint[$pid]['result'] = $r['result'] !== null ? (string) $r['result'] : null;
            }
        }
        return array_values($byPoint);
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
