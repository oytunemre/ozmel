<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class HourlyPointRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_hourly_points';
    }

    protected function columns(): array
    {
        return [
            'product_code_id', 'operation_id', 'measure_location', 'type',
            'nominal', 'lower_limit', 'upper_limit', 'unit',
        ];
    }
}
