<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class WorkCenterRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'work_centers';
    }

    protected function columns(): array
    {
        return ['name', 'is_active'];
    }

    /** UNIQUE(tenant_id, name) hatasini yakalamak yerine once sorar — mesaj daha net olur. */
    public function nameExists(string $name, ?int $exceptId = null): bool
    {
        $sql = 'SELECT COUNT(*) FROM work_centers WHERE tenant_id = :t AND name = :n';
        $params = ['t' => $this->ctx->tenantId, 'n' => $name];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }
}
