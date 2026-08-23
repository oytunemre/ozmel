<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 alan adlari zaten Ingilizce (form/section/question/score/evidence).
 * camelCase <-> snake_case sinirinin tek yeri.
 */
final class Audit
{
    public static function fromRow(array $row): array
    {
        return [
            'id'        => (int) $row['id'],
            'form'      => (string) $row['form'],
            'section'   => (string) $row['section'],
            'question'  => (string) $row['question'],
            'score'     => $row['score'] !== null ? (float) $row['score'] : null,
            'evidence'  => $row['evidence'] !== null ? (string) $row['evidence'] : null,
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
        if (array_key_exists('form', $input)) {
            $out['form'] = trim((string) $input['form']);
        }
        if (array_key_exists('section', $input)) {
            $out['section'] = trim((string) $input['section']);
        }
        if (array_key_exists('question', $input)) {
            $out['question'] = trim((string) $input['question']);
        }
        if (array_key_exists('score', $input)) {
            $v = $input['score'];
            $out['score'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
        }
        if (array_key_exists('evidence', $input)) {
            $val = trim((string) $input['evidence']);
            $out['evidence'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
