<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class CapacityRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'capacities';
    }

    protected function columns(): array
    {
        return ['product_code_id', 'work_center_id', 'operation_id', 'capacity_per_shift', 'minutes'];
    }

    /**
     * UNIQUE(tenant_id, product_code_id, work_center_id, operation_id) hatasini yakalamak
     * yerine once sorar — mesaj daha net olur. Bir (urun, is merkezi, operasyon) uclusu
     * icin tek kapasite olur.
     *
     * operation_id NULL ise MySQL tekil anahtarda cakismaz (operasyonsuz eski kayitlar
     * coklu olabilir); on-kontrol de cakisma bildirmez — DB davranisini birebir yansitir.
     */
    public function tripleExists(int $productCodeId, int $workCenterId, ?int $operationId, ?int $exceptId = null): bool
    {
        if ($operationId === null) {
            return false;
        }
        $sql = "SELECT COUNT(*) FROM `{$this->table()}`
                 WHERE tenant_id = :t AND product_code_id = :p AND work_center_id = :w AND operation_id = :o";
        $params = ['t' => $this->ctx->tenantId, 'p' => $productCodeId, 'w' => $workCenterId, 'o' => $operationId];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }
}
