<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\Context;
use App\Core\Db;

/**
 * Global arama (Cmd/Ctrl+K) — SALT OKUNUR, cok tablolu LIKE. BaseRepository'yi
 * genisletmez (tek tabloya bagli degil) ama tenant filtresini HER sorguda uygular.
 * Her tipten en fazla 5 sonuc; {type, id, label, meta} doner. type = FE modul
 * anahtari — hash router "#<type>?id=<id>" ile o kayda gider (DataTable.focusId).
 */
final class SearchRepository
{
    public function __construct(private Context $ctx) {}

    /** @return list<array{type:string,id:int,label:string,meta:string}> */
    public function search(string $term): array
    {
        $like = '%' . $this->escapeLike($term) . '%';
        $t = $this->ctx->tenantId;
        // ATTR_EMULATE_PREPARES kapaliyken ayni yer tutucu bir sorguda TEK KEZ kullanilabilir.
        // Bu yuzden her LIKE'a ayri isim (:q1, :q2) verilir ve her sorgu kendi param'ini gecirir.
        $out = [];

        $out = array_merge($out, $this->run(
            'product-codes',
            "SELECT id, code, name, type FROM product_codes
              WHERE tenant_id = :t AND (code LIKE :q1 OR name LIKE :q2)
              ORDER BY code LIMIT 5",
            ['t' => $t, 'q1' => $like, 'q2' => $like],
            static fn(array $r): array => [
                'label' => trim(($r['code'] ?? '') . ' · ' . ($r['name'] ?? ''), ' ·'),
                'meta'  => (string) ($r['type'] ?? ''),
            ]
        ));

        $out = array_merge($out, $this->run(
            'orders',
            "SELECT id, order_no, customer, status FROM orders
              WHERE tenant_id = :t AND (order_no LIKE :q1 OR customer LIKE :q2)
              ORDER BY id DESC LIMIT 5",
            ['t' => $t, 'q1' => $like, 'q2' => $like],
            static fn(array $r): array => [
                'label' => (string) ($r['order_no'] ?? ('#' . $r['id'])),
                'meta'  => (string) ($r['customer'] ?? $r['status'] ?? ''),
            ]
        ));

        $out = array_merge($out, $this->run(
            'work-orders',
            "SELECT id, wo_no, split_label, status FROM work_orders
              WHERE tenant_id = :t AND (wo_no LIKE :q1 OR split_label LIKE :q2)
              ORDER BY id DESC LIMIT 5",
            ['t' => $t, 'q1' => $like, 'q2' => $like],
            static fn(array $r): array => [
                'label' => (string) ($r['wo_no'] ?? ('#' . $r['id']))
                    . (!empty($r['split_label']) ? ' · ' . $r['split_label'] : ''),
                'meta'  => (string) ($r['status'] ?? ''),
            ]
        ));

        $out = array_merge($out, $this->run(
            'work-centers',
            "SELECT id, name FROM work_centers
              WHERE tenant_id = :t AND name LIKE :q1
              ORDER BY name LIMIT 5",
            ['t' => $t, 'q1' => $like],
            static fn(array $r): array => ['label' => (string) $r['name'], 'meta' => '']
        ));

        $out = array_merge($out, $this->run(
            'operations',
            "SELECT id, name FROM operations
              WHERE tenant_id = :t AND name LIKE :q1
              ORDER BY name LIMIT 5",
            ['t' => $t, 'q1' => $like],
            static fn(array $r): array => ['label' => (string) $r['name'], 'meta' => '']
        ));

        return $out;
    }

    /**
     * @param array<string,mixed> $params Sorgudaki yer tutucularla BİRE BİR eşleşir.
     * @param callable(array):array{label:string,meta:string} $map
     * @return list<array{type:string,id:int,label:string,meta:string}>
     */
    private function run(string $type, string $sql, array $params, callable $map): array
    {
        $stmt = Db::pdo()->prepare($sql);
        $stmt->execute($params);
        $rows = [];
        foreach ($stmt->fetchAll() as $r) {
            $m = $map($r);
            $rows[] = [
                'type'  => $type,
                'id'    => (int) $r['id'],
                'label' => $m['label'],
                'meta'  => $m['meta'],
            ];
        }
        return $rows;
    }

    /** LIKE ozel karakterlerini kacir (MySQL varsayilan '\' escape). */
    private function escapeLike(string $s): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $s);
    }
}
