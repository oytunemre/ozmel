<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

/**
 * Uretim kayitlari. Ust kayit (is emri) silinince FK ON DELETE CASCADE ile gider;
 * bu tablo kaskad zincirinin YAPRAGIDIR (altinda cocuk yok), ozel silme yok.
 */
final class ProductionRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_production';
    }

    protected function columns(): array
    {
        return [
            'work_order_id', 'date', 'shift', 'target_quantity', 'actual_quantity',
            'scrap_quantity', 'operator_id', 'downtime_start', 'downtime_end', 'note',
        ];
    }
}
