<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class DowntimeReasonRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'downtime_reasons';
    }

    protected function columns(): array
    {
        return ['name', 'is_active'];
    }

    /** UNIQUE(tenant_id, name) — çakışmayı 1062 yerine net mesajla önce sorar. */
    public function nameExists(string $name, ?int $exceptId = null): bool
    {
        $sql = "SELECT COUNT(*) FROM `{$this->table()}` WHERE tenant_id = :t AND name = :n";
        $params = ['t' => $this->ctx->tenantId, 'n' => $name];
        if ($exceptId !== null) {
            $sql .= ' AND id <> :id';
            $params['id'] = $exceptId;
        }
        $stmt = $this->pdo()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn() > 0;
    }

    /**
     * ETL: migration 035 TOHUM kayıtlarını temizler. Yalnızca verilen adlar VE legacy_id
     * NULL olanlar silinir — böylece ETL'den gelen (legacy_id dolu) ya da kullanıcının
     * uygulamadan eklediği farklı adlı nedenlere DOKUNULMAZ. Bir tohum bir üretim kaydınca
     * kullanılıyorsa (FK RESTRICT) o satır KORUNUR ve 'kept'e sayılır (sessizce atlanır).
     *
     * @param list<string> $names silinecek tohum adları
     * @return array{deleted:int, kept:int}
     */
    public function etlDeleteSeeds(array $names): array
    {
        $deleted = 0; $kept = 0;
        $sel = $this->pdo()->prepare(
            "SELECT id FROM `{$this->table()}` WHERE tenant_id = :t AND legacy_id IS NULL AND name = :n"
        );
        $del = $this->pdo()->prepare(
            "DELETE FROM `{$this->table()}` WHERE id = :id AND tenant_id = :t"
        );
        foreach ($names as $name) {
            $sel->execute(['t' => $this->ctx->tenantId, 'n' => $name]);
            foreach ($sel->fetchAll(\PDO::FETCH_COLUMN) as $id) {
                try {
                    $del->execute(['id' => (int) $id, 't' => $this->ctx->tenantId]);
                    $deleted += $del->rowCount();
                } catch (\PDOException $e) {
                    // 1451 = FK ihlali (üretim kaydınca kullanılıyor) → koru.
                    if (($e->errorInfo[1] ?? null) === 1451 || (string) $e->getCode() === '23000') { $kept++; continue; }
                    throw $e;
                }
            }
        }
        return ['deleted' => $deleted, 'kept' => $kept];
    }
}
