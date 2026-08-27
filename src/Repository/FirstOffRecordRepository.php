<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;
use App\Core\Db;
use PDO;

/**
 * First-off kayit ana kaydi + IKI cocuk tablo (olcumler ve gerekceler). Ana kayit
 * ve iki cocuk TEK transaction'da yazilir; ara noktada hata olursa hepsi geri alinir.
 *
 * Tablo adlari yalnizca table(), measurementsTable() ve reasonsTable()'da gecer.
 * (Operator yetkinlikleri deseninin iki-cocuklu hali.)
 */
final class FirstOffRecordRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'first_off_records';
    }

    private function measurementsTable(): string
    {
        return 'first_off_measurements';
    }

    private function reasonsTable(): string
    {
        return 'first_off_reasons';
    }

    protected function columns(): array
    {
        return [
            'product_code_id', 'operation_id', 'date', 'shift', 'operator_name',
            'wo_no', 'sample_count', 'check_time', 'overall_result',
        ];
    }

    /** Ana kayda olcum + gerekce listelerini iliskilendirerek doner. */
    public function find(int $id): ?array
    {
        $row = parent::find($id);
        if ($row === null) {
            return null;
        }
        $row['measurements'] = $this->measurementsFor($id);
        $row['reasons']      = $this->reasonsFor($id);
        return $row;
    }

    /** Listedeki her satira cocuklarini tek sorguda (N+1 yok) ekler. */
    public function paginate(int $page = 1, int $limit = 50): array
    {
        $result = parent::paginate($page, $limit);

        $ids = array_map(static fn(array $r): int => (int) $r['id'], $result['rows']);
        $measByRecord   = $this->measurementsForMany($ids);
        $reasonByRecord = $this->reasonsForMany($ids);
        foreach ($result['rows'] as &$row) {
            $rid = (int) $row['id'];
            $row['measurements'] = $measByRecord[$rid] ?? [];
            $row['reasons']      = $reasonByRecord[$rid] ?? [];
        }
        unset($row);

        return $result;
    }

    /**
     * Ana kayit + iki cocuk tek transaction'da.
     * @param list<array{point_id:int,value:?float,result:?string}> $measurements
     * @param list<string> $reasons
     */
    public function createWithChildren(array $data, array $measurements, array $reasons): int
    {
        return Db::transaction(function () use ($data, $measurements, $reasons): int {
            $id = $this->create($data);
            $this->replaceMeasurements($id, $measurements);
            $this->replaceReasons($id, $reasons);
            return $id;
        });
    }

    /**
     * Ana kayit guncelleme + (istege bagli) cocuklari degistirme, tek transaction.
     * $measurements/$reasons null ise o cocuga dokunulmaz (kismi guncelleme).
     *
     * @param list<array{point_id:int,value:?float,result:?string}>|null $measurements
     * @param list<string>|null $reasons
     * @throws \RuntimeException NOT_FOUND | STALE (BaseRepository::update'ten)
     */
    public function updateWithChildren(int $id, array $data, ?array $measurements, ?array $reasons, ?string $expectedUpdatedAt): void
    {
        Db::transaction(function () use ($id, $data, $measurements, $reasons, $expectedUpdatedAt): void {
            $this->update($id, $data, $expectedUpdatedAt);

            $childChanged = false;
            if ($measurements !== null) {
                $this->replaceMeasurements($id, $measurements);
                $childChanged = true;
            }
            if ($reasons !== null) {
                $this->replaceReasons($id, $reasons);
                $childChanged = true;
            }
            // Cocuk tablo degistiyse ana kaydin damgasi da ilerlemeli.
            if ($childChanged) {
                $this->touch($id);
            }
        });
    }

    /** @return list<array{point_id:int,value:?string,result:?string}> */
    public function measurementsFor(int $recordId): array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT point_id, value, result FROM `{$this->measurementsTable()}`
              WHERE record_id = :r AND tenant_id = :t
              ORDER BY point_id"
        );
        $stmt->execute(['r' => $recordId, 't' => $this->ctx->tenantId]);
        return $stmt->fetchAll();
    }

    /** @return list<string> */
    public function reasonsFor(int $recordId): array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT reason FROM `{$this->reasonsTable()}`
              WHERE record_id = :r AND tenant_id = :t
              ORDER BY reason"
        );
        $stmt->execute(['r' => $recordId, 't' => $this->ctx->tenantId]);
        return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * @param int[] $recordIds
     * @return array<int, list<array>>
     */
    private function measurementsForMany(array $recordIds): array
    {
        if ($recordIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($recordIds), '?'));
        $stmt = $this->pdo()->prepare(
            "SELECT record_id, point_id, value, result FROM `{$this->measurementsTable()}`
              WHERE tenant_id = ? AND record_id IN ($ph)
              ORDER BY point_id"
        );
        $stmt->execute([$this->ctx->tenantId, ...$recordIds]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['record_id']][] = [
                'point_id' => (int) $r['point_id'],
                'value'    => $r['value'],
                'result'   => $r['result'],
            ];
        }
        return $out;
    }

    /**
     * @param int[] $recordIds
     * @return array<int, list<string>>
     */
    private function reasonsForMany(array $recordIds): array
    {
        if ($recordIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($recordIds), '?'));
        $stmt = $this->pdo()->prepare(
            "SELECT record_id, reason FROM `{$this->reasonsTable()}`
              WHERE tenant_id = ? AND record_id IN ($ph)
              ORDER BY reason"
        );
        $stmt->execute([$this->ctx->tenantId, ...$recordIds]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['record_id']][] = (string) $r['reason'];
        }
        return $out;
    }

    /**
     * Olcumleri sil-ve-yeniden-yaz. Transaction icinde cagrilir.
     * @param list<array{point_id:int,value:?float,result:?string}> $measurements
     */
    private function replaceMeasurements(int $recordId, array $measurements): void
    {
        $del = $this->pdo()->prepare(
            "DELETE FROM `{$this->measurementsTable()}` WHERE record_id = :r AND tenant_id = :t"
        );
        $del->execute(['r' => $recordId, 't' => $this->ctx->tenantId]);

        if ($measurements === []) {
            return;
        }
        $ins = $this->pdo()->prepare(
            "INSERT INTO `{$this->measurementsTable()}`
                (tenant_id, record_id, point_id, value, result, created_by, updated_by)
             VALUES (:t, :r, :p, :v, :res, :cb, :ub)"
        );
        foreach ($measurements as $m) {
            $ins->execute([
                't'   => $this->ctx->tenantId,
                'r'   => $recordId,
                'p'   => $m['point_id'],
                'v'   => $m['value'],
                'res' => $m['result'],
                'cb'  => $this->ctx->userId,
                'ub'  => $this->ctx->userId,
            ]);
        }
    }

    /**
     * Gerekceleri sil-ve-yeniden-yaz. Transaction icinde cagrilir.
     * @param list<string> $reasons DTO'da kirpilmis + tekillestirilmis
     */
    private function replaceReasons(int $recordId, array $reasons): void
    {
        $del = $this->pdo()->prepare(
            "DELETE FROM `{$this->reasonsTable()}` WHERE record_id = :r AND tenant_id = :t"
        );
        $del->execute(['r' => $recordId, 't' => $this->ctx->tenantId]);

        if ($reasons === []) {
            return;
        }
        $ins = $this->pdo()->prepare(
            "INSERT INTO `{$this->reasonsTable()}`
                (tenant_id, record_id, reason, created_by, updated_by)
             VALUES (:t, :r, :reason, :cb, :ub)"
        );
        foreach ($reasons as $reason) {
            $ins->execute([
                't'      => $this->ctx->tenantId,
                'r'      => $recordId,
                'reason' => $reason,
                'cb'     => $this->ctx->userId,
                'ub'     => $this->ctx->userId,
            ]);
        }
    }
}
