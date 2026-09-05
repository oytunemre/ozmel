<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

/**
 * Uretim kayitlari. Ust kayit (is emri) silinince FK ON DELETE CASCADE ile gider;
 * bu tablo kaskad zincirinin YAPRAGIDIR (altinda cocuk yok), ozel silme yok.
 */
final class ProductionRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'production';
    }

    protected function columns(): array
    {
        return [
            'work_order_id', 'date', 'shift', 'target_quantity', 'actual_quantity',
            'scrap_quantity', 'operator_id', 'downtime_start', 'downtime_end',
            'downtime_reason_id', 'note',
        ];
    }

    /**
     * Upsert: (work_order_id, date, shift, operator_id) TEKILDIR (migration 042). Ayni
     * besli icin ikinci create ile MUKERRER satir acilmaz — mevcut kayit guncellenir.
     * Boylece iki kisi ayni vardiyayi ayni anda kaydederse 1062 (duplicate) yerine
     * mevcut guncellenir. machine_plans ile ayni desen (migration 033).
     *
     * operator_id NULL ise UNIQUE kisiti carpismaz (MySQL); o durumda upsert YAPILMAZ,
     * her zaman yeni satir olusur — operatorsuz kayitlar serbest.
     *
     * Var olan bir kaydin bilinerek duzenlenmesi (id ile) update() uzerinden gider ve
     * eszamanlilik (409 STALE) orada korunur; bu yol yalnizca create akisindaki dogal
     * anahtar carpismasini emer.
     */
    public function create(array $data): int
    {
        $existing = $this->findByNaturalKey(
            $data['work_order_id'] ?? null,
            (string) ($data['date'] ?? ''),
            (string) ($data['shift'] ?? ''),
            $data['operator_id'] ?? null
        );
        if ($existing !== null) {
            $this->update((int) $existing['id'], $data, null); // null: eszamanlilik atlanir (upsert)
            return (int) $existing['id'];
        }
        return parent::create($data);
    }

    /** (is emri, tarih, vardiya, operator) icin mevcut kayit (tenant kapsamli), yoksa null. */
    private function findByNaturalKey(
        int|string|null $workOrderId,
        string $date,
        string $shift,
        int|string|null $operatorId
    ): ?array {
        // operator_id NULL/bos → tekil kisit disinda; upsert yok, her zaman yeni satir.
        if ($workOrderId === null || $workOrderId === '' || $date === '' || $shift === ''
            || $operatorId === null || $operatorId === '') {
            return null;
        }
        $stmt = $this->pdo()->prepare(
            'SELECT * FROM production
              WHERE tenant_id = :t AND work_order_id = :w AND `date` = :d
                AND shift = :s AND operator_id = :o
              LIMIT 1'
        );
        $stmt->execute([
            't' => $this->ctx->tenantId,
            'w' => (int) $workOrderId,
            'd' => $date,
            's' => $shift,
            'o' => (int) $operatorId,
        ]);
        return $stmt->fetch() ?: null;
    }
}
