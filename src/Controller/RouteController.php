<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\Route;
use App\Repository\RouteRepository;
use App\Validator\RouteValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Ana kayit + varyantlar Repository'de tek transaction'da yazilir.
 */
final class RouteController
{
    private RouteRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new RouteRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            Route::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Rota bulunamadi');
        }
        Response::ok(Route::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new RouteValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        try {
            $id = $this->repo->createWithVariants(Route::toColumns($input), Route::toVariants($input) ?? []);
        } catch (\PDOException $e) {
            // 1062 = tekil kisit ihlali (034: urun+sira+is merkezi+operasyon). 500 yerine
            // kullaniciya anlamli mesaj.
            if (($e->errorInfo[1] ?? null) === 1062) {
                Response::fail(409, 'Bu urun icin ayni sira, is merkezi ve operasyonda bir rota adimi zaten tanimli.', 'DUPLICATE');
            }
            throw $e;
        }
        Response::created(Route::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new RouteValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        try {
            $this->repo->updateWithVariants($id, Route::toColumns($input), Route::toVariants($input), $input['updatedAt'] ?? null);
        } catch (\PDOException $e) {
            // PDOException, RuntimeException'i genisletir — RuntimeException catch'inden ONCE.
            // 1062 = tekil kisit ihlali (034).
            if (($e->errorInfo[1] ?? null) === 1062) {
                Response::fail(409, 'Bu urun icin ayni sira, is merkezi ve operasyonda bir rota adimi zaten tanimli.', 'DUPLICATE');
            }
            throw $e;
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Rota bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(Route::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Rota bulunamadi');
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
