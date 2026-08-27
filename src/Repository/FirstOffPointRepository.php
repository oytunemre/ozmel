<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class FirstOffPointRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'first_off_points';
    }

    protected function columns(): array
    {
        return [
            'product_code_id', 'operation_id', 'point_no', 'characteristic', 'type',
            'nominal', 'lower_limit', 'upper_limit', 'unit',
        ];
    }
}
