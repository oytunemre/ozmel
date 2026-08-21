<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;
use App\Core\Db;
use PDO;

/**
 * Operator ana kaydi + yetkinlikleri (v2_operator_skills). Ana kayit ve
 * yetkinlikler TEK transaction'da yazilir; ara noktada hata olursa ikisi de
 * geri alinir (kismi yazim olmaz).
 *
 * Tablo adlari yalnizca table() ve skillsTable()'da gecer — baska her yerde
 * bu iki metot uzerinden gelir.
 */
final class OperatorRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_operators';
    }

    /** Cocuk tablo adinin tek yeri. */
    private function skillsTable(): string
    {
        return 'v2_operator_skills';
    }

    protected function columns(): array
    {
        return ['full_name', 'badge_no', 'is_active'];
    }

    /** UNIQUE(tenant_id, badge_no) hatasini yakalamak yerine once sorar — mesaj daha net. */
    public function badgeExists(string $badgeNo, ?int $exceptId = null): bool
    {
        $sql = "SELECT COUNT(*) FROM `{$this->table()}` WHERE tenant_id = :t AND badge_no = :b";
        $params = ['t' => $this->ctx->tenantId, 'b' => $badgeNo];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }

    /** Ana kayda yetkinlik listesini iliskilendirerek doner. */
    public function find(int $id): ?array
    {
        $row = parent::find($id);
        if ($row === null) {
            return null;
        }
        $row['skills'] = $this->skillsFor($id);
        return $row;
    }

    /** Listedeki her satira yetkinliklerini tek sorguda (N+1 yok) ekler. */
    public function paginate(int $page = 1, int $limit = 50): array
    {
        $result = parent::paginate($page, $limit);

        $byOperator = $this->skillsForMany(array_map(
            static fn(array $r): int => (int) $r['id'],
            $result['rows']
        ));
        foreach ($result['rows'] as &$row) {
            $row['skills'] = $byOperator[(int) $row['id']] ?? [];
        }
        unset($row);

        return $result;
    }

    /**
     * Ana kayit + yetkinlikler tek transaction'da.
     * @param list<int> $skills operasyon id'leri (v2_operations.id)
     */
    public function createWithSkills(array $data, array $skills): int
    {
        return Db::transaction(function () use ($data, $skills): int {
            $id = $this->create($data);          // ana kayit (BaseRepository)
            $this->replaceSkills($id, $skills);  // cocuk satirlar
            return $id;
        });
    }

    /**
     * Ana kayit guncelleme + (istege bagli) yetkinlikleri degistirme, tek transaction.
     * $skills null ise yetkinliklere dokunulmaz (kismi guncelleme).
     *
     * @param list<int>|null $skills operasyon id'leri (v2_operations.id)
     * @throws \RuntimeException NOT_FOUND | STALE (BaseRepository::update'ten)
     */
     public function updateWithSkills(int $id, array $data, ?array $skills, ?string $expectedUpdatedAt): void
    {
        Db::transaction(function () use ($id, $data, $skills, $expectedUpdatedAt): void {
            // Once eszamanlilik + varlik kontrolu; STALE/NOT_FOUND burada firlar ve
            // transaction geri alinir.
            $this->update($id, $data, $expectedUpdatedAt);

            if ($skills !== null) {
                $this->replaceSkills($id, $skills);
                // Cocuk tablo degistiyse ana kaydin damgasi da ilerlemeli.
                $this->touch($id);
            }
        });
    }

    /** @return list<int> operasyon id'leri (v2_operations.id) */
    public function skillsFor(int $operatorId): array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT operation_id FROM `{$this->skillsTable()}`
              WHERE operator_id = :op AND tenant_id = :t
              ORDER BY operation_id"
        );
        $stmt->execute(['op' => $operatorId, 't' => $this->ctx->tenantId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * Operator id -> yetkin operasyon id'leri. Bos girdide bos dizi.
     * @param int[] $operatorIds
     * @return array<int, list<int>>
     */
    private function skillsForMany(array $operatorIds): array
    {
        if ($operatorIds === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($operatorIds), '?'));
        $stmt = $this->pdo()->prepare(
            "SELECT operator_id, operation_id FROM `{$this->skillsTable()}`
              WHERE tenant_id = ? AND operator_id IN ($placeholders)
              ORDER BY operation_id"
        );
        $stmt->execute([$this->ctx->tenantId, ...$operatorIds]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['operator_id']][] = (int) $r['operation_id'];
        }
        return $out;
    }

    /**
     * Operatorun yetkinliklerini sil-ve-yeniden-yaz. Transaction icinde cagrilir.
     * @param list<int> $skills operasyon id'leri; DTO'da tekillestirilmis
     */
    private function replaceSkills(int $operatorId, array $skills): void
    {
        $del = $this->pdo()->prepare(
            "DELETE FROM `{$this->skillsTable()}` WHERE operator_id = :op AND tenant_id = :t"
        );
        $del->execute(['op' => $operatorId, 't' => $this->ctx->tenantId]);

        if ($skills === []) {
            return;
        }
        // ATTR_EMULATE_PREPARES=false: ayni isimli placeholder iki kez kullanilamaz,
        // bu yuzden created_by/updated_by ayri baglanir.
        $ins = $this->pdo()->prepare(
            "INSERT INTO `{$this->skillsTable()}`
                (tenant_id, operator_id, operation_id, created_by, updated_by)
             VALUES (:t, :op, :opn, :cb, :ub)"
        );
        foreach ($skills as $operationId) {
            $ins->execute([
                't'    => $this->ctx->tenantId,
                'op'   => $operatorId,
                'opn'  => $operationId,
                'cb'   => $this->ctx->userId,
                'ub'   => $this->ctx->userId,
            ]);
        }
    }
}
