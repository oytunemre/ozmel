<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class MachinePlanRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'machine_plans';
    }

    protected function columns(): array
    {
        return ['date', 'work_center_id', 'product_code_id', 'work_order_id', 'target_quantity', 'note'];
    }

    /**
     * Upsert: (tarih, is merkezi) TEKILDIR (migration 033). Ayni hucreye ikinci kayit
     * acilmaz — mevcut kayit guncellenir. Yeni hucrede olusturulur. Boylece iki kisi
     * ayni bos hucreyi ayni anda doldurursa 1062 (duplicate) yerine mevcut guncellenir.
     *
     * Var olan bir hucrenin bilinerek duzenlenmesi (id ile) update() uzerinden gider ve
     * eszamanlilik (409 STALE) orada korunur; bu yol yalnizca create akisindaki dogal
     * anahtar carpismasini emer.
     */
    public function create(array $data): int
    {
        $existing = $this->findByDateWorkCenter(
            (string) ($data['date'] ?? ''),
            $data['work_center_id'] ?? null
        );
        if ($existing !== null) {
            $this->update((int) $existing['id'], $data, null); // null: eszamanlilik atlanir (upsert)
            return (int) $existing['id'];
        }
        return parent::create($data);
    }

    /** (tarih, is merkezi) icin mevcut plan satiri (tenant kapsamli), yoksa null. */
    private function findByDateWorkCenter(string $date, int|string|null $workCenterId): ?array
    {
        if ($date === '' || $workCenterId === null || $workCenterId === '') {
            return null;
        }
        $stmt = $this->pdo()->prepare(
            'SELECT * FROM machine_plans
              WHERE tenant_id = :t AND `date` = :d AND work_center_id = :w
              LIMIT 1'
        );
        $stmt->execute(['t' => $this->ctx->tenantId, 'd' => $date, 'w' => (int) $workCenterId]);
        return $stmt->fetch() ?: null;
    }
}
