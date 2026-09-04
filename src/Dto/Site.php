<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi — tedarikci sitesi. camelCase <-> snake_case siniri.
 *   trigoRE   -> trigo_re
 *   sqeEmail  -> sqe_email · sqmEmail -> sqm_email · siteCode -> site_code
 */
final class Site
{
    public static function fromRow(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'supplier'  => (string) $row['supplier'],
            'trigoRE'   => $row['trigo_re'] !== null ? (string) $row['trigo_re'] : null,
            'sqe'       => $row['sqe'] !== null ? (string) $row['sqe'] : null,
            'sqeEmail'  => $row['sqe_email'] !== null ? (string) $row['sqe_email'] : null,
            'sqm'       => $row['sqm'] !== null ? (string) $row['sqm'] : null,
            'sqmEmail'  => $row['sqm_email'] !== null ? (string) $row['sqm_email'] : null,
            'country'   => $row['country'] !== null ? (string) $row['country'] : null,
            'city'      => $row['city'] !== null ? (string) $row['city'] : null,
            'siteCode'  => $row['site_code'] !== null ? (string) $row['site_code'] : null,
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    public static function toColumns(array $input): array
    {
        $map = [
            'supplier' => 'supplier', 'trigoRE' => 'trigo_re', 'sqe' => 'sqe', 'sqeEmail' => 'sqe_email',
            'sqm' => 'sqm', 'sqmEmail' => 'sqm_email', 'country' => 'country', 'city' => 'city', 'siteCode' => 'site_code',
        ];
        $out = [];
        foreach ($map as $key => $col) {
            if (!array_key_exists($key, $input)) continue;
            if ($col === 'supplier') { $out[$col] = trim((string) $input[$key]); continue; }
            $v = $input[$key] === null ? null : trim((string) $input[$key]);
            $out[$col] = ($v === '') ? null : $v;
        }
        return $out;
    }
}
