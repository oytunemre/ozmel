<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. Tek-satir konfig — istemci DIZI degil TEK NESNE gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari (sabah.../ogledenSonra...) burada Ingilizce API anahtarlarina
 * ve DB sutunlarina cevrilir — camelCase <-> snake_case sinirinin tek yeri.
 *   sabahBaslangic            -> morningStart        / morning_start
 *   sabahMolaBaslangic        -> morningBreakStart   / morning_break_start
 *   sabahMolaBitis            -> morningBreakEnd     / morning_break_end
 *   sabahBitis                -> morningEnd          / morning_end
 *   ogledenSonraBaslangic     -> afternoonStart      / afternoon_start
 *   ogledenSonraMolaBaslangic -> afternoonBreakStart / afternoon_break_start
 *   ogledenSonraMolaBitis     -> afternoonBreakEnd   / afternoon_break_end
 *   ogledenSonraBitis         -> afternoonEnd        / afternoon_end
 */
final class WorkingHours
{
    /** API camelCase <-> DB snake_case. Alan sirasi = mantiksal gun akisi. */
    public const FIELDS = [
        'morningStart'        => 'morning_start',
        'morningBreakStart'   => 'morning_break_start',
        'morningBreakEnd'     => 'morning_break_end',
        'morningEnd'          => 'morning_end',
        'afternoonStart'      => 'afternoon_start',
        'afternoonBreakStart' => 'afternoon_break_start',
        'afternoonBreakEnd'   => 'afternoon_break_end',
        'afternoonEnd'        => 'afternoon_end',
    ];

    public static function fromRow(array $row): array
    {
        $out = [];
        foreach (self::FIELDS as $key => $col) {
            // TIME sutunu 'HH:MM:SS' doner; API'de saniyeyi kirpip 'HH:MM' veririz.
            $out[$key] = self::hhmm((string) $row[$col]);
        }
        $out['updatedAt'] = (string) $row['updated_at'];
        return $out;
    }

    /** Istemci JSON'undan DB sutunlarina. camelCase -> snake_case sinirinin tek yeri. */
    public static function toColumns(array $input): array
    {
        $out = [];
        foreach (self::FIELDS as $key => $col) {
            if (array_key_exists($key, $input)) {
                $out[$col] = trim((string) $input[$key]);
            }
        }
        return $out;
    }

    /** 'HH:MM:SS' -> 'HH:MM' (bos/eksikse oldugu gibi birak). */
    private static function hhmm(string $time): string
    {
        return preg_match('/^\d{2}:\d{2}:\d{2}$/', $time) ? substr($time, 0, 5) : $time;
    }
}
