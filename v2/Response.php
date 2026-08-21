<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Tum endpoint'ler ayni zarfi doner:
 *   { "ok": bool, "data": mixed, "meta": {...}, "errors": [...] }
 * Istemci tek bir sekil bekler, her modulde ayri kontrol yazmaz.
 */
final class Response
{
    public static function ok(mixed $data = null, array $meta = []): never
    {
        self::send(200, ['ok' => true, 'data' => $data, 'meta' => $meta, 'errors' => []]);
    }

    public static function created(mixed $data): never
    {
        self::send(201, ['ok' => true, 'data' => $data, 'meta' => [], 'errors' => []]);
    }

    /** @param array<string,string> $errors alan => mesaj */
    public static function invalid(array $errors): never
    {
        self::send(422, ['ok' => false, 'data' => null, 'meta' => [], 'errors' => $errors]);
    }

    public static function fail(int $status, string $message, string $code = ''): never
    {
        self::send($status, [
            'ok'     => false,
            'data'   => null,
            'meta'   => $code === '' ? [] : ['code' => $code],
            'errors' => ['_' => $message],
        ]);
    }

    private static function send(int $status, array $body): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
        exit;
    }
}
