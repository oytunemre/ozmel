<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari burada Ingilizce API anahtarlarina ve DB sutunlarina cevrilir —
 * camelCase <-> snake_case sinirinin tek yeri. Ekran metinleri FE'de Turkce kalir.
 *   orijinal -> original
 *   ceviri   -> translation
 *   (gizliTerimler dizisi) -> isHidden / is_hidden (bool)
 */
final class Term
{
    public static function fromRow(array $row): array
    {
        return [
            'id'          => (int) $row['id'],
            'original'    => (string) $row['original'],
            'translation' => (string) ($row['translation'] ?? ''),
            'isHidden'    => (bool) $row['is_hidden'],
            'updatedAt'   => (string) $row['updated_at'],
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
        if (array_key_exists('original', $input)) {
            $out['original'] = trim((string) $input['original']);
        }
        if (array_key_exists('translation', $input)) {
            $out['translation'] = trim((string) $input['translation']);
        }
        if (array_key_exists('isHidden', $input)) {
            $out['is_hidden'] = $input['isHidden'] ? 1 : 0;
        }
        return $out;
    }
}
