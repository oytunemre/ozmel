<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 */
final class WorkCenter
{
    public static function fromRow(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'name'      => (string) $row['name'],
            'isActive'  => (bool) $row['is_active'],
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
        if (array_key_exists('isActive', $input)) {
            $out['is_active'] = $input['isActive'] ? 1 : 0;
        }
        return $out;
    }
}
