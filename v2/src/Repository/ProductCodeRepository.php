<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class ProductCodeRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_product_codes';
    }

    protected function columns(): array
    {
        return [
            'code', 'name', 'type', 'unit', 'status', 'category',
            'drawing_no', 'revision', 'revision_date', 'note',
            'suppliers', 'customer', 'outgoing_operation_id', 'parent_product_code',
            'outer_diameter', 'inner_diameter', 'material_length', 'material_weight',
            'min_stock_level', 'supply_days', 'box_quantity',
        ];
    }

    /** UNIQUE(tenant_id, code) hatasini yakalamak yerine once sorar — mesaj daha net olur. */
    public function codeExists(string $code, ?int $exceptId = null): bool
    {
        $sql = "SELECT COUNT(*) FROM `{$this->table()}` WHERE tenant_id = :t AND code = :c";
        $params = ['t' => $this->ctx->tenantId, 'c' => $code];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }
}
