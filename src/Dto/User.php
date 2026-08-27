<?php
declare(strict_types=1);

namespace App\Dto;

/**
 * API sozlesmesi. password_hash BILEREK hicbir yanitta donmez.
 *
 * Kimlik kaynagi v1 ile paylasilan `users` tablosudur (cutover'a kadar). role
 * simdilik hep 'editor' (yetki matrisi yok — tum kullanicilar yonetici).
 *
 *   username     -> username
 *   display_name -> displayName
 *   is_active    -> isActive (0/1)
 */
final class User
{
    public static function fromRow(array $row): array
    {
        return [
            'id'          => (int) $row['id'],
            'username'    => (string) $row['username'],
            'displayName' => (string) $row['display_name'],
            'role'        => (string) $row['role'],
            'isActive'    => (int) $row['is_active'],
            'createdAt'   => isset($row['created_at']) ? (string) $row['created_at'] : null,
            'updatedAt'   => isset($row['updated_at']) && $row['updated_at'] !== null ? (string) $row['updated_at'] : null,
        ];
    }

    /** @param array<array> $rows */
    public static function fromRows(array $rows): array
    {
        return array_map([self::class, 'fromRow'], $rows);
    }

    /**
     * Profil guncelleme sutunlari. username ve parola BURADA YOK: username create'e
     * ozgu ve login kimligi (degistirilmez); parola ayrica hash'lenir, sutun degil.
     */
    public static function toColumns(array $input): array
    {
        $out = [];
        if (array_key_exists('displayName', $input)) {
            $out['display_name'] = trim((string) $input['displayName']);
        }
        if (array_key_exists('isActive', $input)) {
            $out['is_active'] = (int) (bool) $input['isActive'];
        }
        return $out;
    }
}
