<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class MachinePlanRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'machine_plans';
    }

    protected function columns(): array
    {
        return ['date', 'work_center_id', 'product_code_id', 'work_order_id', 'target_quantity', 'note'];
    }
}
