<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class TermRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_terms';
    }

    protected function columns(): array
    {
        return ['original', 'translation', 'is_hidden'];
    }

    /** UNIQUE(tenant_id, original) hatasini yakalamak yerine once sorar — mesaj daha net olur. */
    public function originalExists(string $original, ?int $exceptId = null): bool
    {
        $sql = "SELECT COUNT(*) FROM `{$this->table()}` WHERE tenant_id = :t AND original = :o";
        $params = ['t' => $this->ctx->tenantId, 'o' => $original];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }
}
