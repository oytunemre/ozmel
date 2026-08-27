<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class PurchaseRequestRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'purchase_requests';
    }

    protected function columns(): array
    {
        return [
            'material_code_id', 'product_code_id', 'quantity', 'unit', 'supplier',
            'request_date', 'expected_date', 'order_id', 'note',
        ];
    }
}
