<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1'de operasyonlarListesi {id, ad} idi; burada tek anlamli alan `name`.
 * Ekran metinleri FE'de Turkce kalir, API anahtari Ingilizce.
 */
final class Operation
{
    public static function fromRow(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'name'      => (string) $row['name'],
            'updatedAt' => (string) $row['updated_at'],
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
        if (array_key_exists('name', $input)) {
            $out['name'] = trim((string) $input['name']);
        }
        return $out;
    }
}
