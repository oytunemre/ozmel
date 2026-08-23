<?php
declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/**
 * Firma basina TEK satir olan konfig tablolari icin ince taban (orn. calisma saatleri).
 *
 * BaseRepository id ile calisir; burada kayit id yerine tenant_id ile bulunur —
 * cunku bir firmanin tek konfig satiri vardir. BaseRepository'yi DEGISTIRMEDEN,
 * yalnizca tenant-kapsamli find/update ekler. Eszamanlilik (updated_at) kontrolu
 * ayni sekilde korunur: istemcinin okudugu updated_at degismisse yazma reddedilir.
 *
 * INSERT/DELETE yoktur — satir migration'da tohumlanir, hep vardir.
 */
abstract class SingletonRepository extends BaseRepository
{
    /** Firmanin tek konfig satiri. Migration tohumladigi icin normalde hep vardir. */
    public function findForTenant(): ?array
    {
        $stmt = $this->pdo()->prepare(
            "SELECT * FROM `{$this->table()}` WHERE tenant_id = :t"
        );
        $stmt->execute(['t' => $this->ctx->tenantId]);
        return $stmt->fetch() ?: null;
    }

    /**
     * Firmanin konfig satirini gunceller (id gerekmez).
     *
     * @param string|null $expectedUpdatedAt Istemcinin okudugu deger; null gecilirse
     *        eszamanlilik kontrolu atlanir.
     * @throws RuntimeException NOT_FOUND — satir yok (tohumlanmamis firma)
     * @throws RuntimeException STALE     — kayit araya girip degismis
     */
    public function updateForTenant(array $data, ?string $expectedUpdatedAt): void
    {
        $current = $this->findForTenant();
        if ($current === null) {
            throw new RuntimeException('NOT_FOUND');
        }
        if ($expectedUpdatedAt !== null && $current['updated_at'] !== $expectedUpdatedAt) {
            throw new RuntimeException('STALE');
        }

        $data = array_intersect_key($data, array_flip($this->columns()));
        if ($data === []) {
            return;
        }
        $data['updated_by'] = $this->ctx->userId;

        $sets = implode(',', array_map(static fn($c) => "`$c` = :$c", array_keys($data)));
        $sql  = "UPDATE `{$this->table()}` SET $sets WHERE tenant_id = :_t";

        $this->pdo()->prepare($sql)->execute($data + ['_t' => $this->ctx->tenantId]);
    }
}
