<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class PurchaseReceiptRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_purchase_receipts';
    }

    protected function columns(): array
    {
        return ['purchase_request_id', 'date', 'quantity', 'note'];
    }
}
