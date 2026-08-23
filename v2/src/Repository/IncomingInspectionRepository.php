<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;
use App\Core\Db;
use PDO;

/**
 * Giris kalite kontrol ana kaydi + IKI SEVIYE ic ice cocuk:
 *   kayit -> karakteristik[] (seviye 1) -> deger[] (seviye 2)
 *
 * Ana kayit + tum karakteristikler + tum degerler TEK transaction'da yazilir.
 * Cocuk (herhangi seviye) degisince damga DOGRUDAN ANA KAYDA (bu tabloya) touch()
 * ile atilir — eszamanlilik kontrolu ana kayit updated_at uzerinden yapiliyor,
 * ara karakteristik tablosuna DOKUNULMAZ.
 *
 * Tablo adlari yalnizca table(), characteristicsTable() ve valuesTable()'da gecer.
 */
final class IncomingInspectionRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_incoming_inspections';
    }

    private function characteristicsTable(): string
    {
        return 'v2_incoming_characteristics';
    }

    private function valuesTable(): string
    {
        return 'v2_incoming_values';
    }

    protected function columns(): array
    {
        return [
            'legacy_purchase_receipt_id', 'purchase_receipt_id', 'supplier', 'material_code_id',
            'drawing_no', 'reason', 'arrival_date', 'inspection_date', 'received_qty', 'sample_qty',
            'inspector_name', 'overall_result',
        ];
    }

    /** Ana kayda karakteristikleri (her biri degerleriyle) iliskilendirerek doner. */
    public function find(int $id): ?array
    {
        $row = parent::find($id);
        if ($row === null) {
            return null;
        }
        $row['characteristics'] = $this->characteristicsFor([$id])[$id] ?? [];
        return $row;
    }

    /** Listedeki her satira karakteristik+deger agacini eklER (seviye basina tek sorgu; N+1 yok). */
    public function paginate(int $page = 1, int $limit = 50): array
    {
        $result = parent::paginate($page, $limit);

        $byInspection = $this->characteristicsFor(array_map(
            static fn(array $r): int => (int) $r['id'],
            $result['rows']
        ));
        foreach ($result['rows'] as &$row) {
            $row['characteristics'] = $byInspection[(int) $row['id']] ?? [];
        }
        unset($row);

        return $result;
    }

    /**
     * Ana kayit + karakteristikler + degerler tek transaction'da.
     * @param list<array{cols: array, values: list<?float>}> $characteristics
     */
    public function createWithChildren(array $data, array $characteristics): int
    {
        return Db::transaction(function () use ($data, $characteristics): int {
            $id = $this->create($data);
            $this->insertCharacteristics($id, $characteristics);
            return $id;
        });
    }

    /**
     * Ana kayit guncelleme + (istege bagli) tum agaci degistirme, tek transaction.
     * $characteristics null ise cocuklara dokunulmaz (kismi guncelleme).
     *
     * @param list<array{cols: array, values: list<?float>}>|null $characteristics
     * @throws \RuntimeException NOT_FOUND | STALE (BaseRepository::update'ten)
     */
    public function updateWithChildren(int $id, array $data, ?array $characteristics, ?string $expectedUpdatedAt): void
    {
        Db::transaction(function () use ($id, $data, $characteristics, $expectedUpdatedAt): void {
            $this->update($id, $data, $expectedUpdatedAt);

            if ($characteristics !== null) {
                // Karakteristikleri sil (FK cascade ile degerleri de gider), yeniden yaz.
                $del = $this->pdo()->prepare(
                    "DELETE FROM `{$this->characteristicsTable()}` WHERE inspection_id = :i AND tenant_id = :t"
                );
                $del->execute(['i' => $id, 't' => $this->ctx->tenantId]);
                $this->insertCharacteristics($id, $characteristics);

                // Cocuk (her iki seviye) degisti; damga DOGRUDAN ANA KAYDA ilerlesin.
                $this->touch($id);
            }
        });
    }

    /**
     * Inspection id -> karakteristik agaci (her karakteristik 'values' ile).
     * Seviye basina tek sorgu.
     *
     * @param int[] $inspectionIds
     * @return array<int, list<array>>
     */
    private function characteristicsFor(array $inspectionIds): array
    {
        if ($inspectionIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($inspectionIds), '?'));
        $stmt = $this->pdo()->prepare(
            "SELECT * FROM `{$this->characteristicsTable()}`
              WHERE tenant_id = ? AND inspection_id IN ($ph)
              ORDER BY inspection_id, char_no"
        );
        $stmt->execute([$this->ctx->tenantId, ...$inspectionIds]);
        $chars = $stmt->fetchAll();

        // Tum karakteristiklerin degerlerini tek sorguda al, char id'ye grupla.
        $valuesByChar = $this->valuesForChars(array_map(
            static fn(array $c): int => (int) $c['id'],
            $chars
        ));

        $out = [];
        foreach ($chars as $c) {
            $c['values'] = $valuesByChar[(int) $c['id']] ?? [];
            $out[(int) $c['inspection_id']][] = $c;
        }
        return $out;
    }

    /**
     * @param int[] $charIds
     * @return array<int, list<array{value:?string,result:?string}>> char_id -> sequence sirali deger listesi
     */
    private function valuesForChars(array $charIds): array
    {
        if ($charIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($charIds), '?'));
        $stmt = $this->pdo()->prepare(
            "SELECT characteristic_id, value, result FROM `{$this->valuesTable()}`
              WHERE tenant_id = ? AND characteristic_id IN ($ph)
              ORDER BY characteristic_id, sequence"
        );
        $stmt->execute([$this->ctx->tenantId, ...$charIds]);

        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[(int) $r['characteristic_id']][] = ['value' => $r['value'], 'result' => $r['result']];
        }
        return $out;
    }

    /**
     * Karakteristikleri ve degerlerini ekler (transaction icinde cagrilir).
     * @param list<array{cols: array, values: list<array{value:?float,result:?string}>}> $characteristics
     */
    private function insertCharacteristics(int $inspectionId, array $characteristics): void
    {
        if ($characteristics === []) {
            return;
        }
        $insChar = $this->pdo()->prepare(
            "INSERT INTO `{$this->characteristicsTable()}`
                (tenant_id, inspection_id, char_no, name, spec_text, type,
                 nominal, lower_limit, upper_limit, unit, created_by, updated_by)
             VALUES (:t, :i, :no, :name, :spec, :type, :nom, :low, :up, :unit, :cb, :ub)"
        );
        $insValue = $this->pdo()->prepare(
            "INSERT INTO `{$this->valuesTable()}`
                (tenant_id, characteristic_id, sequence, value, result, created_by, updated_by)
             VALUES (:t, :c, :s, :v, :res, :cb, :ub)"
        );

        foreach ($characteristics as $c) {
            $cols = $c['cols'];
            $insChar->execute([
                't'    => $this->ctx->tenantId,
                'i'    => $inspectionId,
                'no'   => $cols['char_no'],
                'name' => $cols['name'],
                'spec' => $cols['spec_text'],
                'type' => $cols['type'],
                'nom'  => $cols['nominal'],
                'low'  => $cols['lower_limit'],
                'up'   => $cols['upper_limit'],
                'unit' => $cols['unit'],
                'cb'   => $this->ctx->userId,
                'ub'   => $this->ctx->userId,
            ]);
            $charId = (int) $this->pdo()->lastInsertId();

            $seq = 0;
            foreach ($c['values'] as $v) {
                $insValue->execute([
                    't'   => $this->ctx->tenantId,
                    'c'   => $charId,
                    's'   => $seq++,
                    'v'   => $v['value'],
                    'res' => $v['result'],
                    'cb'  => $this->ctx->userId,
                    'ub'  => $this->ctx->userId,
                ]);
            }
        }
    }
}
