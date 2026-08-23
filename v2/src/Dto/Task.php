<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. DB satiri ne olursa olsun istemci BU sekli gorur.
 * Sutun adi degisirse tek yer degisir, istemci etkilenmez.
 *
 * v1 gorevler alan adlari -> Ingilizce API/DB:
 *   sira              -> sequence
 *   gorevTanimi       -> description
 *   departman         -> department
 *   anaSorumlu        -> primaryAssigneeId   (isim -> v2_task_people.id, ETL'de eslenir)
 *   yardimci          -> secondaryAssigneeId (isim -> v2_task_people.id)
 *   oncelik           -> priority
 *   termin            -> dueDate
 *   durum             -> status
 *   tamamlanmaYuzdesi -> completionRatio (0–1 kesir, yuzde degil)
 *   notlar            -> notes
 */
final class Task
{
    public static function fromRow(array $row): array
    {
        return [
            'id'                  => (int) $row['id'],
            'sequence'            => $row['sequence'] !== null ? (int) $row['sequence'] : null,
            'description'         => (string) $row['description'],
            'department'          => $row['department'] !== null ? (string) $row['department'] : null,
            'primaryAssigneeId'   => $row['primary_assignee_id'] !== null ? (int) $row['primary_assignee_id'] : null,
            'secondaryAssigneeId' => $row['secondary_assignee_id'] !== null ? (int) $row['secondary_assignee_id'] : null,
            'priority'            => $row['priority'] !== null ? (string) $row['priority'] : null,
            'dueDate'             => $row['due_date'] !== null ? (string) $row['due_date'] : null,
            'status'              => $row['status'] !== null ? (string) $row['status'] : null,
            'completionRatio'     => $row['completion_ratio'] !== null ? (float) $row['completion_ratio'] : null,
            'notes'               => $row['notes'] !== null ? (string) $row['notes'] : null,
            'updatedAt'           => (string) $row['updated_at'],
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
        if (array_key_exists('sequence', $input)) {
            $v = $input['sequence'];
            $out['sequence'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (int) $v;
        }
        if (array_key_exists('description', $input)) {
            $out['description'] = trim((string) $input['description']);
        }
        if (array_key_exists('department', $input)) {
            $val = trim((string) $input['department']);
            $out['department'] = $val === '' ? null : $val;
        }
        if (array_key_exists('primaryAssigneeId', $input)) {
            $id = (int) $input['primaryAssigneeId'];
            $out['primary_assignee_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('secondaryAssigneeId', $input)) {
            $id = (int) $input['secondaryAssigneeId'];
            $out['secondary_assignee_id'] = $id > 0 ? $id : null;
        }
        if (array_key_exists('priority', $input)) {
            $val = trim((string) $input['priority']);
            $out['priority'] = $val === '' ? null : $val;
        }
        if (array_key_exists('dueDate', $input)) {
            $val = trim((string) $input['dueDate']);
            $out['due_date'] = $val === '' ? null : $val;
        }
        if (array_key_exists('status', $input)) {
            $val = trim((string) $input['status']);
            $out['status'] = $val === '' ? null : $val;
        }
        if (array_key_exists('completionRatio', $input)) {
            $v = $input['completionRatio'];
            $out['completion_ratio'] = ($v === null || (is_string($v) && trim($v) === '')) ? null : (float) $v;
        }
        if (array_key_exists('notes', $input)) {
            $val = trim((string) $input['notes']);
            $out['notes'] = $val === '' ? null : $val;
        }
        return $out;
    }
}
