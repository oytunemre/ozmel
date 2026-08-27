<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Oturumdan gelen istek baglami: kim, hangi firma, ne yetkiyle.
 * tenantId TEK kaynaktir — repository'ler her sorguda bunu kullanir,
 * boylece bir firmanin verisi digerine sizamaz.
 */
final class Context
{
    public function __construct(
        public readonly int $tenantId,
        public readonly int $userId,
        public readonly string $role,
        public readonly string $displayName,
    ) {}

    public function isEditor(): bool
    {
        return $this->role === 'editor';
    }

    /** v1'deki api.php ile ayni oturum mekanizmasi: X-Session-Token basligi. */
    public static function fromRequest(): self
    {
        $token = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
        if ($token === '') {
            Response::fail(401, 'Oturum bulunamadi — lutfen giris yapin', 'NO_SESSION');
        }

        $stmt = Db::pdo()->prepare(
            'SELECT user_id, tenant_id, role, display_name
               FROM sessions
              WHERE token = :t AND expires_at > NOW()'
        );
        $stmt->execute(['t' => $token]);
        $row = $stmt->fetch();

        if (!$row) {
            Response::fail(401, 'Oturum suresi dolmus — lutfen tekrar giris yapin', 'SESSION_EXPIRED');
        }

        return new self(
            tenantId:    (int) ($row['tenant_id'] ?? 1),
            userId:      (int) $row['user_id'],
            role:        (string) $row['role'],
            displayName: (string) $row['display_name'],
        );
    }
}
