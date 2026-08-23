<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\ProductTree;
use App\Repository\ProductTreeRepository;
use App\Validator\ProductTreeValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Oz-referansli agac: alt dugumler DB'de cascade ile silinir; self-parent
 * dongusu Validator'da engellenir.
 */
final class ProductTreeController
{
    private ProductTreeRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new ProductTreeRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            ProductTree::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Agac dugumu bulunamadi');
        }
        Response::ok(ProductTree::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new ProductTreeValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $id = $this->repo->create(ProductTree::toColumns($input));
        Response::created(ProductTree::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        // selfId verilir ki dugum kendi kendine parent olamasin (dogrudan dongu).
        $v = (new ProductTreeValidator())->validate($input, isCreate: false, selfId: $id);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = ProductTree::toColumns($input);

        // Dolayli dongu: onerilen ust dugum, bu dugumun alt agacindaysa reddet.
        // (Validator yalnizca dogrudan self-parent'i gorur; zincir yuruyusu Repository'de.)
        if (array_key_exists('parent_id', $cols) && $cols['parent_id'] !== null
            && $this->repo->wouldCycle($id, (int) $cols['parent_id'])) {
            Response::invalid(['parentId' => 'Bir dugum kendi alt agacinin altina tasinamaz']);
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Agac dugumu bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(ProductTree::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Agac dugumu bulunamadi');
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
