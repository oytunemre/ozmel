<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

/**
 * Kontrol planlari — salt okunur (ekran plani okur, duzenlemez; ETL doldurur).
 * columns() ETL yazimi (etlUpsert) icin whitelist'tir; API'den yazma yok.
 */
final class ControlPlanRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'control_plans';
    }

    protected function columns(): array
    {
        return [
            'product_code_id', 'sequence_label', 'operation_id', 'operation_label', 'work_center_id',
            'characteristic', 'specification_raw', 'type',
            'lower_limit', 'upper_limit', 'nominal', 'unit',
            'measure_method', 'sample_size', 'check_frequency', 'record_form', 'action_on_fail',
        ];
    }
}
