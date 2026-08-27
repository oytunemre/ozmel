<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\Context;
use App\Core\Response;
use App\Dto\User;
use App\Repository\UserRepository;
use App\Validator\UserValidator;
use RuntimeException;

/**
 * Kullanici Yonetimi — hesap yonetimi (yetki matrisi yok; tum kullanicilar 'editor').
 * Kimlik kaynagi v1 ile paylasilan `users`/`sessions` tablolaridir.
 *
 * Rotalar:
 *   GET  api/users                 liste (password_hash donmez)
 *   POST api/users                 yeni kullanici (parola hash'lenir)
 *   POST api/users/{id}?op=guncelle ad + durum
 *   POST api/users/{id}?op=sifre    sifre sifirlama
 */
final class UserController
{
    private UserRepository $repo;

    public function __construct(private Context $ctx)
    {
        $this->repo = new UserRepository($ctx);
    }

    public function index(array $query): never
    {
        $rows = $this->repo->all();
        Response::ok(User::fromRows($rows), ['total' => count($rows)]);
    }

    public function show(int $id): never
    {
        $row = $this->repo->find($id);
        if ($row === null) {
            Response::fail(404, 'Kullanici bulunamadi');
        }
        Response::ok(User::fromRow($row));
    }

    public function store(array $input): never
    {
        $this->requireEditor();

        $v = (new UserValidator())->validate($input, mode: 'create');
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $username = trim((string) ($input['username'] ?? ''));
        if ($this->repo->usernameExists($username)) {
            Response::invalid(['username' => 'Bu kullanici adi zaten alinmis']);
        }

        $hash = password_hash((string) $input['password'], PASSWORD_DEFAULT);
        $id = $this->repo->create(
            $username,
            $hash,
            trim((string) ($input['displayName'] ?? '')),
            'editor'   // simdilik tum kullanicilar yonetici/editor
        );

        Response::created(User::fromRow($this->repo->find($id)));
    }

    public function update(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new UserValidator())->validate($input, mode: 'update');
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        // Kendi hesabini pasife alma engeli — yoneticinin kendini kilitlemesini onler.
        if ($id === $this->ctx->userId
            && array_key_exists('isActive', $input)
            && (int) (bool) $input['isActive'] === 0) {
            Response::invalid(['isActive' => 'Kendi hesabinizi pasife alamazsiniz']);
        }

        $cols = User::toColumns($input);
        try {
            $this->repo->updateProfile($id, $cols, $input['updatedAt'] ?? null);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'NOT_FOUND') {
                Response::fail(404, 'Kullanici bulunamadi');
            }
            if ($e->getMessage() === 'STALE') {
                Response::fail(409, 'Bu kayit siz acdiktan sonra baskasi tarafindan degistirildi. Sayfayi yenileyip tekrar deneyin.', 'STALE');
            }
            throw $e;
        }

        Response::ok(User::fromRow($this->repo->find($id)));
    }

    /** POST api/users/{id}?op=sifre — router bu op'u resetPassword'a yonlendirir. */
    public function resetPassword(int $id, array $input): never
    {
        $this->requireEditor();

        $v = (new UserValidator())->validate($input, mode: 'password');
        if ($v->fails()) {
            Response::invalid($v->errors());
        }

        $hash = password_hash((string) $input['password'], PASSWORD_DEFAULT);
        if (!$this->repo->resetPassword($id, $hash)) {
            Response::fail(404, 'Kullanici bulunamadi');
        }

        Response::ok(['id' => $id]);
    }

    /** Kullanicilar silinmez — gecmis/oturum butunlugu icin durumu Pasif yapilir. */
    public function destroy(int $id): never
    {
        Response::fail(405, 'Kullanicilar silinemez; durumu Pasif yapin');
    }

    private function requireEditor(): void
    {
        if (!$this->ctx->isEditor()) {
            Response::fail(403, 'Bu islem icin yetkiniz yok', 'READ_ONLY');
        }
    }
}
