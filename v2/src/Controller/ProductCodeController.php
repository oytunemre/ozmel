<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\ProductCode;
use App\Repository\ProductCodeRepository;
use App\Validator\ProductCodeValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Tip'e bagli kural (olcu alanlari yalnizca Hammadde) Validator'da; guncellemede
 * istemci `type` gondermezse mevcut kaydin tipi Validator'a verilir.
 */
final class ProductCodeController
{
    private ProductCodeRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new ProductCodeRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            ProductCode::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Kod tanimi bulunamadi');
        }
        Response::ok(ProductCode::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new ProductCodeValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = ProductCode::toColumns($input);
        if ($this->repo->codeExists($cols['code'])) {
            Response::invalid(['code' => 'Bu kod ile bir kayit zaten var']);
        }

        $id = $this->repo->create($cols);
        Response::created(ProductCode::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        // Tip gonderilmediyse tip'e bagli kural mevcut kaydin tipi uzerinden isler.
        $existing = $this->repo->find($id);
        if ($existing === null) {
            Response::fail(404, 'Kod tanimi bulunamadi');
        }

        $v = (new ProductCodeValidator())->validate($input, isCreate: false, existingType: (string) $existing['type']);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = ProductCode::toColumns($input);
        if (isset($cols['code']) && $this->repo->codeExists($cols['code'], $id)) {
            Response::invalid(['code' => 'Bu kod ile bir kayit zaten var']);
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Kod tanimi bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(ProductCode::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Kod tanimi bulunamadi');
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
