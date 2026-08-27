<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;
use App\Core\Db;
use PDO;

/**
 * Rota ana kaydi + varyant secenekleri (route_variants). Ana kayit ve varyantlar
 * TEK transaction'da yazilir; ara noktada hata olursa ikisi de geri alinir.
 *
 * Tablo adlari yalnizca table() ve variantsTable()'da gecer — baska her yerde
 * bu iki metot uzerinden gelir. (Operator yetkinlikleri desteginin ayni deseni.)
 */
final class RouteRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'routes';
    }

    /** Cocuk tablo adinin tek yeri. */
    private function variantsTable(): string
    {
        return 'route_variants';
    }

    protected function columns(): array
    {
        return ['product_code_id', 'operation_id', 'work_center_id', 'sequence', 'is_active', 'variant_label'];
    }

    /** Ana kayda varyant listesini iliskilendirerek doner. */
    public function find(int $id): ?array
    {
        $row = parent::find($id);
        if ($row === null) {
            return null;
        }
        $row['variants'] = $this->variantsFor($id);
        return $row;
    }

    /** Listedeki her satira varyantlarini tek sorguda (N+1 yok) ekler. */
    public function paginate(int $page = 1, int $limit = 50): array
    {
        $result = parent::paginate($page, $limit);

        $byRoute = $this->variantsForMany(array_map(
            static fn(array $r): int => (int) $r['id'],
            $result['rows']
        ));
        foreach ($result['rows'] as &$row) {
            $row['variants'] = $byRoute[(int) $row['id']] ?? [];
        }
        unset($row);

        return $result;
    }

    /**
     * Ana kayit + varyantlar tek transaction'da.
     * @param list<string> $variants varyant secenekleri
     */
    public function createWithVariants(array $data, array $variants): int
    {
        return Db::transaction(function () use ($data, $variants): int {
            $id = $this->create($data);            // ana kayit (BaseRepository)
            $this->replaceVariants($id, $variants); // cocuk satirlar
            return $id;
        });
    }

    /**
     * Ana kayit guncelleme + (istege bagli) varyantlari degistirme, tek transaction.
     * $variants null ise varyantlara dokunulmaz (kismi guncelleme).
     *
     * @param list<string>|null $variants
     * @throws \RuntimeException NOT_FOUND | STALE (BaseRepository::update'ten)
     */
    public function updateWithVariants(int $id, array $data, ?array $variants, ?string $expectedUpdatedAt): void
    {
        Db::transaction(function () use ($id, $data, $variants, $expectedUpdatedAt): void {
            // Once eszamanlilik + varlik kontrolu; STALE/NOT_FOUND burada firlar ve
            // transaction geri alinir.
            $this->update($id, $data, $expectedUpdatedAt);

            if ($variants !== null) {
                $this->replaceVariants($id, $variants);
                // Cocuk tablo degistiyse ana kaydin damgasi da ilerlemeli.
                $this->touch($id);
            }
        });
    }

    /** @return list<string> varyant secenekleri */
    public function variantsFor(int $routeId): array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT value FROM `{$this->variantsTable()}`
              WHERE route_id = :r AND tenant_id = :t
              ORDER BY value"
        );
        $stmt->execute(['r' => $routeId, 't' => $this->ctx->tenantId]);
        return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * Rota id -> varyant secenekleri. Bos girdide bos dizi.
     * @param int[] $routeIds
     * @return array<int, list<string>>
     */
    private function variantsForMany(array $routeIds): array
    {
        if ($routeIds === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($routeIds), '?'));
        $stmt = $this->pdo()->prepare(
            "SELECT route_id, value FROM `{$this->variantsTable()}`
              WHERE tenant_id = ? AND route_id IN ($placeholders)
              ORDER BY value"
        );
        $stmt->execute([$this->ctx->tenantId, ...$routeIds]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['route_id']][] = (string) $r['value'];
        }
        return $out;
    }

    /**
     * Rotanin varyantlarini sil-ve-yeniden-yaz. Transaction icinde cagrilir.
     * @param list<string> $variants DTO'da kirpilmis + tekillestirilmis
     */
    private function replaceVariants(int $routeId, array $variants): void
    {
        $del = $this->pdo()->prepare(
            "DELETE FROM `{$this->variantsTable()}` WHERE route_id = :r AND tenant_id = :t"
        );
        $del->execute(['r' => $routeId, 't' => $this->ctx->tenantId]);

        if ($variants === []) {
            return;
        }
        // ATTR_EMULATE_PREPARES=false: ayni isimli placeholder iki kez kullanilamaz,
        // bu yuzden created_by/updated_by ayri baglanir.
        $ins = $this->pdo()->prepare(
            "INSERT INTO `{$this->variantsTable()}`
                (tenant_id, route_id, value, created_by, updated_by)
             VALUES (:t, :r, :v, :cb, :ub)"
        );
        foreach ($variants as $value) {
            $ins->execute([
                't'  => $this->ctx->tenantId,
                'r'  => $routeId,
                'v'  => $value,
                'cb' => $this->ctx->userId,
                'ub' => $this->ctx->userId,
            ]);
        }
    }
}
