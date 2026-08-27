<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;
use App\Core\Db;

final class OrderRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'orders';
    }

    protected function columns(): array
    {
        return [
            'order_no', 'source', 'status', 'customer', 'sales_order_no',
            'product_code_id', 'target_quantity', 'start_date', 'requested_delivery_date', 'note',
        ];
    }

    /**
     * UNIQUE(tenant_id, order_no, product_code_id) hatasini yakalamak yerine once sorar.
     * order_no bir musteri siparis numarasidir; ayni no altinda FARKLI urunler olabilir,
     * ama ayni urun iki kez girilemez — bu yuzden kontrol no + urun bilesik.
     */
    public function orderNoExists(string $orderNo, int $productCodeId, ?int $exceptId = null): bool
    {
        $sql = "SELECT COUNT(*) FROM `{$this->table()}`
                 WHERE tenant_id = :t AND order_no = :o AND product_code_id = :p";
        $params = ['t' => $this->ctx->tenantId, 'o' => $orderNo, 'p' => $productCodeId];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }

    /**
     * Siparisi siler. Is emirleri (work_orders) ve onlarin uretim kayitlari
     * (production) FK ON DELETE CASCADE zinciriyle ayni islemde gider; makine
     * planlarinin work_order_id'si ise SET NULL olur.
     *
     * Tek DELETE + InnoDB kaskadi zaten atomiktir; yine de transaction'a alarak
     * "yarim kalmaz" garantisini acikca ifade ederiz (ileride ek temizlik eklenirse
     * de guvenli kalir).
     */
    public function delete(int $id): bool
    {
        return Db::transaction(fn(): bool => parent::delete($id));
    }
}
