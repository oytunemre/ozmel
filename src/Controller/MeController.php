<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Repository\UserRepository;

/**
 * Oturum sahibi — GET api/me. Context oturumu (X-Session-Token) zaten dogruladi;
 * burada session'daki user_id ile users satiri okunup GUNCEL bilgi doner
 * (display_name/role login'den sonra degismis olabilir). password_hash donmez.
 */
final class MeController
{
    public function __construct(private Context $ctx) {}

    public function index(array $query): never
    {
        $row = (new UserRepository($this->ctx))->find($this->ctx->userId);
        if ($row === null || (int) $row['is_active'] === 0) {
            // Oturum var ama kullanici silinmis/pasif -> istemci login'e donmeli.
            Response::fail(401, 'Oturum gecerli degil', 'NO_USER');
        }
        Response::ok([
            'displayName' => (string) $row['display_name'],
            'role'        => (string) $row['role'],
            'username'    => (string) $row['username'],
        ]);
    }

    public function show(int $id): never
    {
        Response::fail(404, 'Bilinmeyen kaynak');
    }
}
