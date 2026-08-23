<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;
use App\Core\Db;

/**
 * Saatlik kayit ana kaydi + olcum cocuk tablosu. Ana kayit ve olcumler TEK
 * transaction'da yazilir; cocuk degisince ana kaydin damgasi touch() ile ilerler.
 *
 * Tablo adlari yalnizca table() ve measurementsTable()'da gecer. First-off'tan
 * farki: bir nokta icin BIRDEN COK deger; sequence sirayi korur.
 */
final class HourlyRecordRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_hourly_records';
    }

    private function measurementsTable(): string
    {
        return 'v2_hourly_measurements';
    }

    protected function columns(): array
    {
        return [
            'product_code_id', 'operation_id', 'date', 'shift', 'hour',
            'personnel_name', 'machine_name', 'production_count',
        ];
    }

    /** Ana kayda olcumleri iliskilendirerek doner. */
    public function find(int $id): ?array
    {
        $row = parent::find($id);
        if ($row === null) {
            return null;
        }
        $row['measurements'] = $this->measurementsFor($id);
        return $row;
    }

    /** Listedeki her satira olcumlerini tek sorguda (N+1 yok) ekler. */
    public function paginate(int $page = 1, int $limit = 50): array
    {
        $result = parent::paginate($page, $limit);

        $byRecord = $this->measurementsForMany(array_map(
            static fn(array $r): int => (int) $r['id'],
            $result['rows']
        ));
        foreach ($result['rows'] as &$row) {
            $row['measurements'] = $byRecord[(int) $row['id']] ?? [];
        }
        unset($row);

        return $result;
    }

    /**
     * Ana kayit + olcumler tek transaction'da.
     * @param list<array{point_id:int,sequence:int,value:?float}> $measurements
     */
    public function createWithMeasurements(array $data, array $measurements): int
    {
        return Db::transaction(function () use ($data, $measurements): int {
            $id = $this->create($data);
            $this->replaceMeasurements($id, $measurements);
            return $id;
        });
    }

    /**
     * Ana kayit guncelleme + (istege bagli) olcumleri degistirme, tek transaction.
     * $measurements null ise olcumlere dokunulmaz (kismi guncelleme).
     *
     * @param list<array{point_id:int,sequence:int,value:?float}>|null $measurements
     * @throws \RuntimeException NOT_FOUND | STALE (BaseRepository::update'ten)
     */
    public function updateWithMeasurements(int $id, array $data, ?array $measurements, ?string $expectedUpdatedAt): void
    {
        Db::transaction(function () use ($id, $data, $measurements, $expectedUpdatedAt): void {
            $this->update($id, $data, $expectedUpdatedAt);
            if ($measurements !== null) {
                $this->replaceMeasurements($id, $measurements);
                $this->touch($id);
            }
        });
    }

    /** @return list<array{point_id:int,sequence:int,value:?string}> nokta+sequence sirali */
    public function measurementsFor(int $recordId): array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT point_id, sequence, value FROM `{$this->measurementsTable()}`
              WHERE record_id = :r AND tenant_id = :t
              ORDER BY point_id, sequence"
        );
        $stmt->execute(['r' => $recordId, 't' => $this->ctx->tenantId]);
        return $stmt->fetchAll();
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
            "SELECT record_id, point_id, sequence, value FROM `{$this->measurementsTable()}`
              WHERE tenant_id = ? AND record_id IN ($ph)
              ORDER BY point_id, sequence"
        );
        $stmt->execute([$this->ctx->tenantId, ...$recordIds]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['record_id']][] = [
                'point_id' => (int) $r['point_id'],
                'sequence' => (int) $r['sequence'],
                'value'    => $r['value'],
            ];
        }
        return $out;
    }

    /**
     * Olcumleri sil-ve-yeniden-yaz. Transaction icinde cagrilir.
     * @param list<array{point_id:int,sequence:int,value:?float}> $measurements
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
                (tenant_id, record_id, point_id, sequence, value, created_by, updated_by)
             VALUES (:t, :r, :p, :s, :v, :cb, :ub)"
        );
        foreach ($measurements as $m) {
            $ins->execute([
                't'  => $this->ctx->tenantId,
                'r'  => $recordId,
                'p'  => $m['point_id'],
                's'  => $m['sequence'],
                'v'  => $m['value'],
                'cb' => $this->ctx->userId,
                'ub' => $this->ctx->userId,
            ]);
        }
    }
}
