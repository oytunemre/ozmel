<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\Operator;
use App\Repository\OperatorRepository;
use App\Validator\OperatorValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Ana kayit + yetkinlikler Repository'de tek transaction'da yazilir.
 */
final class OperatorController
{
    private OperatorRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new OperatorRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            Operator::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Operator bulunamadi');
        }
        Response::ok(Operator::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new OperatorValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = Operator::toColumns($input);
        if ($this->repo->badgeExists($cols['badge_no'])) {
            Response::invalid(['badgeNo' => 'Bu sicil no ile bir operator zaten var']);
        }

        $id = $this->repo->createWithSkills($cols, Operator::toSkills($input) ?? []);
        Response::created(Operator::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new OperatorValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = Operator::toColumns($input);
        if (isset($cols['badge_no']) && $this->repo->badgeExists($cols['badge_no'], $id)) {
            Response::invalid(['badgeNo' => 'Bu sicil no ile bir operator zaten var']);
        }

        try {
            $this->repo->updateWithSkills($id, $cols, Operator::toSkills($input), $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Operator bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(Operator::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Operator bulunamadi');
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
