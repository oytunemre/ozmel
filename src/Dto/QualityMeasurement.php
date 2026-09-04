<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi — kalite olcumu. APPEND-ONLY: her giris yeni satir; (siparis, madde)
 * icin ekranda EN SON olcum gosterilir. camelCase <-> snake_case siniri.
 *   orderId        -> order_id
 *   kontrolPlaniId -> control_plan_id
 *   tarih          -> measured_at
 *   vardiya        -> shift
 *   deger          -> value (nitel maddede NULL)
 *   sonuc          -> result (Uygun | Uygun Değil)
 *   operator/not   -> operator / note
 */
final class QualityMeasurement
{
    public static function fromRow(array $row): array
    {
        return [
            'id'            => (int) $row['id'],
            'orderId'       => (int) $row['order_id'],
            'controlPlanId' => (int) $row['control_plan_id'],
            'measuredAt'    => $row['measured_at'] !== null ? (string) $row['measured_at'] : null,
            'shift'         => $row['shift'] !== null ? (string) $row['shift'] : null,
            'value'         => $row['value'] !== null ? (float) $row['value'] : null,
            'result'        => $row['result'] !== null ? (string) $row['result'] : null,
            'operator'      => $row['operator'] !== null ? (string) $row['operator'] : null,
            'note'          => $row['note'] !== null ? (string) $row['note'] : null,
            'createdAt'     => (string) $row['created_at'],
            'updatedAt'     => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    public static function toColumns(array $input): array
    {
        $out = [];
        if (array_key_exists('orderId', $input))       $out['order_id']        = (int) $input['orderId'];
        if (array_key_exists('controlPlanId', $input)) $out['control_plan_id'] = (int) $input['controlPlanId'];
        if (array_key_exists('measuredAt', $input))    $out['measured_at']     = self::nullStr($input['measuredAt']);
        if (array_key_exists('shift', $input))         $out['shift']           = self::nullStr($input['shift']);
        if (array_key_exists('value', $input))         $out['value']           = ($input['value'] === null || $input['value'] === '') ? null : (float) $input['value'];
        if (array_key_exists('result', $input))        $out['result']          = self::nullStr($input['result']);
        if (array_key_exists('operator', $input))      $out['operator']        = self::nullStr($input['operator']);
        if (array_key_exists('note', $input))          $out['note']            = self::nullStr($input['note']);
        return $out;
    }

    private static function nullStr(mixed $v): ?string
    {
        if ($v === null) return null;
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }
}
