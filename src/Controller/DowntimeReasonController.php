<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\DowntimeReason;
use App\Repository\DowntimeReasonRepository;
use App\Validator\DowntimeReasonValidator;
use RuntimeException;

/**
 * Durus nedenleri — basit CRUD (Tanimlar). Ad + aktif/pasif. Yetki + dogrulama +
 * yanit; SQL Repository'de. Silme yerine pasife alma onerilir (production FK RESTRICT).
 */
final class DowntimeReasonController
{
    private DowntimeReasonRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new DowntimeReasonRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );
        Response::ok(
            DowntimeReason::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Durus nedeni bulunamadi');
        }
        Response::ok(DowntimeReason::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new DowntimeReasonValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = DowntimeReason::toColumns($input);
        if ($this->repo->nameExists($cols['name'])) {
            Response::invalid(['name' => 'Bu durus nedeni zaten var']);
        }

        $id = $this->repo->create($cols);
        Response::created(DowntimeReason::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new DowntimeReasonValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = DowntimeReason::toColumns($input);
        if (isset($cols['name']) && $this->repo->nameExists($cols['name'], $id)) {
            Response::invalid(['name' => 'Bu durus nedeni zaten var']);
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Durus nedeni bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(DowntimeReason::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        try {
            if (!$this->repo->delete($id)) {
                Response::fail(404, 'Durus nedeni bulunamadi');
            }
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'IN_USE') {
                Response::fail(409, 'Bu neden uretim kayitlarinda kullanildigi icin silinemez. Pasife alabilirsiniz.', 'IN_USE');
            }
            throw $e;
        }
        Response::ok(['id' => $id]);
    }

    private function requireEditor(): void
    {
        if (!$this->ctx->isEditor()) {
            Response::fail(403, 'Bu islem icin duzenleme yetkisi gerekiyor', 'READ_ONLY');
        }
    }
}
