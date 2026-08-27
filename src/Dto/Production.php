<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   workOrderId     -> workOrderId (work_orders.id)
 *   tarih           -> date
 *   vardiya         -> shift (Sabah / Öğleden Sonra / Mesai)
 *   hedefAdet       -> targetQuantity
 *   gercekAdet      -> actualQuantity
 *   fireAdet        -> scrapQuantity
 *   operator        -> operatorId (operators.id)
 *   durusBaslangic  -> downtimeStart
 *   durusBitis      -> downtimeEnd
 *   not             -> note
 */
final class Production
{
    public static function fromRow(array $row): array
    {
        return [
            'id'             => (int) $row['id'],
            'workOrderId'    => (int) $row['work_order_id'],
            'date'           => (string) $row['date'],
            'shift'          => (string) $row['shift'],
            'targetQuantity' => $row['target_quantity'] !== null ? (float) $row['target_quantity'] : null,
            'actualQuantity' => (float) $row['actual_quantity'],
            'scrapQuantity'  => (float) $row['scrap_quantity'],
            'operatorId'     => $row['operator_id'] !== null ? (int) $row['operator_id'] : null,
            'downtimeStart'  => self::hhmm($row['downtime_start'] ?? null),
            'downtimeEnd'    => self::hhmm($row['downtime_end'] ?? null),
            'note'           => $row['note'] !== null ? (string) $row['note'] : null,
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
        if (array_key_exists('workOrderId', $input)) {
            $out['work_order_id'] = (int) $input['workOrderId'];
        }
        if (array_key_exists('date', $input)) {
            $out['date'] = trim((string) $input['date']);
        }
        if (array_key_exists('shift', $input)) {
            $out['shift'] = trim((string) $input['shift']);
        }
        if (array_key_exists('targetQuantity', $input)) {
            $out['target_quantity'] = self::toDecimal($input['targetQuantity']);
        }
        if (array_key_exists('actualQuantity', $input)) {
            $out['actual_quantity'] = (float) $input['actualQuantity'];
        }
        if (array_key_exists('scrapQuantity', $input)) {
            $out['scrap_quantity'] = (float) $input['scrapQuantity'];
        }
        if (array_key_exists('operatorId', $input)) {
            $id = (int) $input['operatorId'];
            $out['operator_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('downtimeStart', $input)) {
            $val = trim((string) $input['downtimeStart']);
            $out['downtime_start'] = $val === '' ? null : $val;
        }
        if (array_key_exists('downtimeEnd', $input)) {
            $val = trim((string) $input['downtimeEnd']);
            $out['downtime_end'] = $val === '' ? null : $val;
        }
        if (array_key_exists('note', $input)) {
            $val = trim((string) $input['note']);
            $out['note'] = $val === '' ? null : $val;
        }
        return $out;
    }

    private static function toDecimal(mixed $v): ?float
    {
        if ($v === null || (is_string($v) && trim($v) === '')) {
            return null;
        }
        return (float) $v;
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
