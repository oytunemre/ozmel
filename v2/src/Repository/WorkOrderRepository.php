<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;
use App\Core\Db;

final class WorkOrderRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'work_orders';
    }

    protected function columns(): array
    {
        return [
            'wo_no', 'order_id', 'product_code_id', 'operation_id', 'work_center_id',
            'sequence', 'target_quantity', 'status', 'split_label',
        ];
    }

    /**
     * UNIQUE(tenant_id, wo_no, product_code_id) hatasini yakalamak yerine once sorar.
     * wo_no ayni siparis numarasi gibi bir urun kalemine ozgu degildir; ayni no altinda
     * FARKLI urunler olabilir, ama ayni urun iki kez girilemez — kontrol no + urun bilesik.
     */
    public function woNoExists(string $woNo, int $productCodeId, ?int $exceptId = null): bool
    {
        $sql = "SELECT COUNT(*) FROM `{$this->table()}`
                 WHERE tenant_id = :t AND wo_no = :w AND product_code_id = :p";
        $params = ['t' => $this->ctx->tenantId, 'w' => $woNo, 'p' => $productCodeId];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }

    /**
     * Is emrini siler. Uretim kayitlari (production) FK ON DELETE CASCADE ile
     * ayni islemde gider. Tek DELETE + kaskad zaten atomiktir; "yarim kalmaz"
     * garantisini acikca ifade etmek icin transaction'a alinir (siparis silmesiyle ayni desen).
     */
    public function delete(int $id): bool
    {
        return Db::transaction(fn(): bool => parent::delete($id));
    }
}
