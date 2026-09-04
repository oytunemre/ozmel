<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi — kontrol plani maddesi (salt okunur; ETL doldurur, ekran okur).
 * camelCase <-> snake_case siniri. Tasarimda gorunmeyen alanlar (measureMethod,
 * sampleSize, checkFrequency, recordForm, actionOnFail) da doner — veri kaybolmaz.
 *   urun          -> productCodeId
 *   sira          -> sequenceLabel  ("G"/"S"/"1".."5" — METIN)
 *   operasyon     -> operationId (rota disi degerlerde ETL NULL birakir)
 *   isMerkezi     -> workCenterId
 *   spesifikasyonRaw -> specificationRaw
 *   tip           -> type (olcusel | nitel)
 *   numuneAdedi   -> sampleSize (v1'de cogunlukla serbest metin)
 */
final class ControlPlan
{
    public static function fromRow(array $row): array
    {
        return [
            'id'               => (int) $row['id'],
            'productCodeId'    => (int) $row['product_code_id'],
            'sequenceLabel'    => $row['sequence_label'] !== null ? (string) $row['sequence_label'] : null,
            'operationId'      => $row['operation_id'] !== null ? (int) $row['operation_id'] : null,
            'operationLabel'   => $row['operation_label'] !== null ? (string) $row['operation_label'] : null,
            'workCenterId'     => $row['work_center_id'] !== null ? (int) $row['work_center_id'] : null,
            'characteristic'   => (string) $row['characteristic'],
            'specificationRaw' => $row['specification_raw'] !== null ? (string) $row['specification_raw'] : null,
            'type'             => (string) $row['type'],
            'lowerLimit'       => $row['lower_limit'] !== null ? (float) $row['lower_limit'] : null,
            'upperLimit'       => $row['upper_limit'] !== null ? (float) $row['upper_limit'] : null,
            'nominal'          => $row['nominal'] !== null ? (float) $row['nominal'] : null,
            'unit'             => $row['unit'] !== null ? (string) $row['unit'] : null,
            'measureMethod'    => $row['measure_method'] !== null ? (string) $row['measure_method'] : null,
            'sampleSize'       => $row['sample_size'] !== null ? (string) $row['sample_size'] : null,
            'checkFrequency'   => $row['check_frequency'] !== null ? (string) $row['check_frequency'] : null,
            'recordForm'       => $row['record_form'] !== null ? (string) $row['record_form'] : null,
            'actionOnFail'     => $row['action_on_fail'] !== null ? (string) $row['action_on_fail'] : null,
            'updatedAt'        => (string) $row['updated_at'],
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }
}
