<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\TaskPerson;
use App\Repository\TaskPersonRepository;
use App\Validator\TaskPersonValidator;
use RuntimeException;

/**
 * Yetki + dogrulama + yanit. Is mantigi Repository'de, SQL burada YOK.
 * Paylasimli kisi dizini; gorevler (v2_tasks) buna FK ile baglanir.
 */
final class TaskPersonController
{
    private TaskPersonRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new TaskPersonRepository($ctx);
    }

    public function index(array $query): never
    {
        $result = $this->repo->paginate(
            (int) ($query['page'] ?? 1),
            (int) ($query['limit'] ?? 50)
        );

        Response::ok(
            TaskPerson::fromRows($result['rows']),
            ['page' => (int) ($query['page'] ?? 1), 'total' => $result['total']]
        );
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Kisi bulunamadi');
        }
        Response::ok(TaskPerson::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new TaskPersonValidator())->validate($input, isCreate: true);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = TaskPerson::toColumns($input);
        if ($this->repo->nameExists($cols['name'])) {
            Response::invalid(['name' => 'Bu isimde bir kisi zaten var']);
        }

        $id = $this->repo->create($cols);
        Response::created(TaskPerson::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new TaskPersonValidator())->validate($input, isCreate: false);
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $cols = TaskPerson::toColumns($input);
        if (isset($cols['name']) && $this->repo->nameExists($cols['name'], $id)) {
            Response::invalid(['name' => 'Bu isimde bir kisi zaten var']);
        }

        try {
            $this->repo->update($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Kisi bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(TaskPerson::fromRow($this->repo->find($id)));
    }

    public function destroy(int $id): never
    {
        $this->requireEditor();

        // Kisi silinince gorevlerin atamasi FK ile NULL olur (gorev kalir).
        if (!$this->repo->delete($id)) {
            Response::fail(404, 'Kisi bulunamadi');
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
