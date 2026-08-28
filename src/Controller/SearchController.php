<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Repository\SearchRepository;

/**
 * Global arama (Cmd/Ctrl+K) — SALT OKUNUR. GET api/search?q=...
 * q < 2 karakter -> bos liste. Sonuc: [{type, id, label, meta}], her tipten en fazla 5.
 * Yazma yok; Validator yok.
 */
final class SearchController
{
    private SearchRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new SearchRepository($ctx);
    }

    /** GET api/search?q= */
    public function index(array $query): never
    {
        $q = trim((string) ($query['q'] ?? ''));
        if (mb_strlen($q) < 2) {
            Response::ok([]);
        }
        Response::ok($this->repo->search($q));
    }

    /** /search/{id} anlamsiz — okuma amacli tekil kaynak degil. */
    public function show(int $id): never
    {
        Response::fail(404, 'Bilinmeyen kaynak');
    }
}
