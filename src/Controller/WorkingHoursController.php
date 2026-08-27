<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\WorkingHours;
use App\Repository\WorkingHoursRepository;
use App\Validator\WorkingHoursValidator;
use RuntimeException;

/**
 * Tek-satir konfig kaynagi — endpoint deseni digerlerinden FARKLI:
 *   GET  api/working-hours              -> tek nesne (liste degil)
 *   POST api/working-hours?op=guncelle  -> gunceller
 * store/destroy YOK; satir migration'da tohumlanir, hep vardir. id kullanilmaz,
 * kayit tenant_id ile bulunur (SingletonRepository).
 */
final class WorkingHoursController
{
    private WorkingHoursRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new WorkingHoursRepository($ctx);
    }

    /** GET api/working-hours — firmanin tek konfig satiri. */
    public function show(): never
    {
        $row = $this->repo->findForTenant();
        if ($row === null) {
            // Migration her firmayi tohumlar; buraya normalde dusulmez.
            Response::fail(404, 'Calisma saatleri konfigurasyonu bulunamadi');
        }
        Response::ok(WorkingHours::fromRow($row));
    }

    /** POST api/working-hours?op=guncelle */
    public function update(array $input): never
    {
        $this->requireEditor();

        $v = (new WorkingHoursValidator())->validate($input);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        try {
            $this->repo->updateForTenant(WorkingHours::toColumns($input), $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Calisma saatleri konfigurasyonu bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(WorkingHours::fromRow($this->repo->findForTenant()));
    }

    private function requireEditor(): void
    {
        if (!$this->ctx->isEditor()) {
            Response::fail(403, 'Bu islem icin duzenleme yetkisi gerekiyor', 'READ_ONLY');
        }
    }
}
