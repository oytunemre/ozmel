<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

/**
 * Kalite olcumleri — APPEND-ONLY (create + read). Guncelleme/silme yok; her giris
 * yeni satir. columns() hem API create'i hem ETL upsert'i icin whitelist.
 */
final class QualityMeasurementRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'quality_measurements';
    }

    protected function columns(): array
    {
        return ['order_id', 'control_plan_id', 'measured_at', 'shift', 'value', 'result', 'operator', 'note'];
    }
}
