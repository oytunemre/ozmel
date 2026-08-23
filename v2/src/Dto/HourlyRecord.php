<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   urun        -> productCodeId (v2_product_codes.id)
 *   operasyon   -> operationId   (v2_operations.id)
 *   tarih       -> date
 *   vardiya     -> shift
 *   saat        -> hour
 *   personel    -> personnelName (isim, FK degil)
 *   makina      -> machineName   (isim, FK degil)
 *   uretimAdedi -> productionCount
 *   degerler{}  -> measurements (cocuk: v2_hourly_measurements)
 *
 * measurements sekli: [{pointId, values:[deger,...]}]. Bir nokta icin degisken
 * sayida deger; DB'de her deger ayri satir (sequence = dizi indeksi).
 */
final class HourlyRecord
{
    public static function fromRow(array $row): array
    {
        return [
            'id'              => (int) $row['id'],
            'productCodeId'   => (int) $row['product_code_id'],
            'operationId'     => (int) $row['operation_id'],
            'date'            => (string) $row['date'],
            'shift'           => (string) $row['shift'],
            'hour'            => self::hhmm($row['hour'] ?? null),
            'personnelName'   => $row['personnel_name'] !== null ? (string) $row['personnel_name'] : null,
            'machineName'     => $row['machine_name'] !== null ? (string) $row['machine_name'] : null,
            'productionCount' => $row['production_count'] !== null ? (int) $row['production_count'] : null,
            'measurements'    => self::groupMeasurements($row['measurements'] ?? []),
            'updatedAt'       => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    /** Ana tablo sutunlari. Olcumler ayri (toMeasurements). */
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
        if (array_key_exists('hour', $input)) {
            $val = trim((string) $input['hour']);
            $out['hour'] = $val === '' ? null : $val;
        }
        if (array_key_exists('personnelName', $input)) {
            $val = trim((string) $input['personnelName']);
            $out['personnel_name'] = $val === '' ? null : $val;
        }
        if (array_key_exists('machineName', $input)) {
            $val = trim((string) $input['machineName']);
            $out['machine_name'] = $val === '' ? null : $val;
        }
        if (array_key_exists('productionCount', $input)) {
            $v = $input['productionCount'];
            $out['production_count'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (int) $v;
        }
        return $out;
    }

    /**
     * Olcumleri DB satir sekline duzler. `measurements` anahtari YOKSA null ("dokunma").
     * Girdi: [{pointId, values:[...]}]; cikti: her deger bir satir {point_id, sequence, value}.
     * sequence = ilgili noktanin values dizisindeki indeks (sirayi korur).
     *
     * @return list<array{point_id:int,sequence:int,value:?float}>|null
     */
    public static function toMeasurements(array $input): ?array
    {
        if (!array_key_exists('measurements', $input)) {
            return null;
        }
        if (!is_array($input['measurements'])) {
            return [];
        }
        $rows = [];
        $seenPoints = [];
        foreach ($input['measurements'] as $m) {
            if (!is_array($m)) {
                continue;
            }
            $pointId = (int) ($m['pointId'] ?? 0);
            if ($pointId <= 0 || isset($seenPoints[$pointId])) {
                continue; // gecersiz ya da tekrar eden nokta atlanir
            }
            $seenPoints[$pointId] = true;

            $values = is_array($m['values'] ?? null) ? $m['values'] : [];
            $seq = 0;
            foreach ($values as $v) {
                $rows[] = [
                    'point_id' => $pointId,
                    'sequence' => $seq++,
                    'value'    => ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v,
                ];
            }
        }
        return $rows;
    }

    /**
     * DB satirlarini (point_id, sequence, value; point+sequence sirali) nokta bazinda
     * gruplar: [{pointId, values:[...]}]. Sira korunur.
     */
    private static function groupMeasurements(array $rows): array
    {
        $byPoint = [];
        foreach ($rows as $r) {
            $pid = (int) $r['point_id'];
            if (!isset($byPoint[$pid])) {
                $byPoint[$pid] = ['pointId' => $pid, 'values' => []];
            }
            $byPoint[$pid]['values'][] = $r['value'] !== null ? (float) $r['value'] : null;
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
