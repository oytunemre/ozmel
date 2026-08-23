<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class CapacityRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_capacities';
    }

    protected function columns(): array
    {
        return ['product_code_id', 'work_center_id', 'capacity_per_shift', 'minutes'];
    }

    /**
     * UNIQUE(tenant_id, product_code_id, work_center_id) hatasini yakalamak yerine once
     * sorar — mesaj daha net olur. Bir urun-is merkezi cifti icin tek kapasite olur.
     */
    public function pairExists(int $productCodeId, int $workCenterId, ?int $exceptId = null): bool
    {
        $sql = "SELECT COUNT(*) FROM `{$this->table()}`
                 WHERE tenant_id = :t AND product_code_id = :p AND work_center_id = :w";
        $params = ['t' => $this->ctx->tenantId, 'p' => $productCodeId, 'w' => $workCenterId];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }
}
