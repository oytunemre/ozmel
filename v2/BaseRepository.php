<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use RuntimeException;

/**
 * Tum SQL burada. Iki seyi merkezi olarak garanti eder:
 *
 *  1. TENANT FILTRESI — her sorguya WHERE tenant_id eklenir. Modul yazan
 *     kisi unutamaz, cunku sorguyu kendi yazmaz.
 *  2. ESZAMANLILIK — guncellemede istemcinin okudugu updated_at karsilastirilir.
 *     Baskasi araya girdiyse yazma reddedilir; v1'de sessizce eziliyordu.
 */
abstract class BaseRepository
{
    abstract protected function table(): string;

    /** @return string[] Istemciden kabul edilen sutunlar. Whitelist. */
    abstract protected function columns(): array;

    public function __construct(protected Context $ctx) {}

    protected function pdo(): PDO
    {
        return Db::pdo();
    }

    /** @return array{rows: array, total: int} */
    public function paginate(int $page = 1, int $limit = 50): array
    {
        $page  = max(1, $page);
        $limit = min(200, max(1, $limit));
        $table = $this->table();

        $count = $this->pdo()->prepare("SELECT COUNT(*) FROM `$table` WHERE tenant_id = :t");
        $count->execute(['t' => $this->ctx->tenantId]);
        $total = (int) $count->fetchColumn();

        $stmt = $this->pdo()->prepare(
            "SELECT * FROM `$table` WHERE tenant_id = :t ORDER BY id DESC LIMIT :lim OFFSET :off"
        );
        $stmt->bindValue('t', $this->ctx->tenantId, PDO::PARAM_INT);
        $stmt->bindValue('lim', $limit, PDO::PARAM_INT);
        $stmt->bindValue('off', ($page - 1) * $limit, PDO::PARAM_INT);
        $stmt->execute();

        return ['rows' => $stmt->fetchAll(), 'total' => $total];
    }

    public function find(int $id): ?array
    {
        $table = $this->table();
        $stmt  = $this->pdo()->prepare("SELECT * FROM `$table` WHERE id = :id AND tenant_id = :t");
        $stmt->execute(['id' => $id, 't' => $this->ctx->tenantId]);
        return $stmt->fetch() ?: null;
    }

    public function create(array $data): int
    {
        $data = $this->onlyAllowed($data);
        $data['tenant_id']  = $this->ctx->tenantId;
        $data['created_by'] = $this->ctx->userId;
        $data['updated_by'] = $this->ctx->userId;

        $cols = array_keys($data);
        $sql  = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $this->table(),
            implode(',', array_map(fn($c) => "`$c`", $cols)),
            implode(',', array_map(fn($c) => ":$c", $cols))
        );

        $this->pdo()->prepare($sql)->execute($data);
        return (int) $this->pdo()->lastInsertId();
    }

    /**
     * @param string|null $expectedUpdatedAt Istemcinin okudugu deger.
     *        Null gecilirse eszamanlilik kontrolu yapilmaz (toplu islemler icin).
     * @throws RuntimeException STALE — kayit araya girip degismis
     */
    public function update(int $id, array $data, ?string $expectedUpdatedAt): void
    {
        $current = $this->find($id);
        if ($current === null) {
            throw new RuntimeException('NOT_FOUND');
        }
        if ($expectedUpdatedAt !== null && $current['updated_at'] !== $expectedUpdatedAt) {
            throw new RuntimeException('STALE');
        }

        $data = $this->onlyAllowed($data);
        if ($data === []) {
            return;
        }
        $data['updated_by'] = $this->ctx->userId;

        $sets = implode(',', array_map(fn($c) => "`$c` = :$c", array_keys($data)));
        $sql  = "UPDATE `{$this->table()}` SET $sets WHERE id = :_id AND tenant_id = :_t";

        $this->pdo()->prepare($sql)->execute($data + ['_id' => $id, '_t' => $this->ctx->tenantId]);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->pdo()->prepare(
            "DELETE FROM `{$this->table()}` WHERE id = :id AND tenant_id = :t"
        );
        $stmt->execute(['id' => $id, 't' => $this->ctx->tenantId]);
        return $stmt->rowCount() > 0;
    }

    /** Istemci fazladan alan gonderirse (tenant_id gibi) sessizce atilir. */
    private function onlyAllowed(array $data): array
    {
        return array_intersect_key($data, array_flip($this->columns()));
    }
}
