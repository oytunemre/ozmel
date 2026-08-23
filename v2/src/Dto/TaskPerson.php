<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 gorevKisiler {isim, eposta, telefon} — paylasimli kisi dizini.
 *   isim    -> name
 *   eposta  -> email
 *   telefon -> phone
 */
final class TaskPerson
{
    public static function fromRow(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'name'      => (string) $row['name'],
            'email'     => $row['email'] !== null ? (string) $row['email'] : null,
            'phone'     => $row['phone'] !== null ? (string) $row['phone'] : null,
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
        if (array_key_exists('email', $input)) {
            $val = trim((string) $input['email']);
            $out['email'] = $val === '' ? null : $val;
        }
        if (array_key_exists('phone', $input)) {
            $val = trim((string) $input['phone']);
            $out['phone'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
