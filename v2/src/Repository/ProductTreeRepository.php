<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

/**
 * Oz-referansli agac. Alt dugumler DB'de ON DELETE CASCADE ile silinir (bkz.
 * 008_product_trees.sql). Dongu/self-parent korumasi Validator'dadir.
 */
final class ProductTreeRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'v2_product_trees';
    }

    protected function columns(): array
    {
        return [
            'parent_id', 'product_code_id', 'material_code_id', 'material_description',
            'description', 'revision', 'revision_date',
            'unit_quantity', 'outer_diameter', 'inner_diameter', 'material_length',
            'material_weight', 'part_length', 'cut_loss', 'supplier_cut_length',
        ];
    }

    /**
     * $selfId dugumu $proposedParentId altina tasinirsa dongu olur mu?
     *
     * Onerilen ust dugumden baslayip parent_id zincirini YUKARI yururuz; zincirde
     * $selfId'e rastlarsak, onerilen ust aslinda $selfId'in alt agacindadir — yani
     * dugum kendi alt agacinin altina tasiniyordur (1->2->1 gibi). Dogrudan
     * self-parent (parentId == selfId) da bu yuruyusun ilk adiminda yakalanir.
     *
     * Derinlik siniri: mevcut veride zaten bir dongu varsa ( or. eski hatali kayit)
     * sonsuz donmemek icin. Sinira takilirsak guvenli tarafta kalip dongu sayariz.
     *
     * @param int $maxDepth Yukari yuruyus ust siniri (makul agac derinliginin cok ustu).
     */
    public function wouldCycle(int $selfId, int $proposedParentId, int $maxDepth = 100): bool
    {
        $stmt = $this->pdo()->prepare(
            "SELECT parent_id FROM `{$this->table()}` WHERE id = :id AND tenant_id = :t"
        );

        $cursor = $proposedParentId;
        for ($depth = 0; $depth < $maxDepth; $depth++) {
            if ($cursor === $selfId) {
                return true;                 // zincirde kendimize donduk -> dongu
            }
            $stmt->execute(['id' => $cursor, 't' => $this->ctx->tenantId]);
            $row = $stmt->fetch();
            if ($row === false || $row['parent_id'] === null) {
                return false;                // koke ulastik / zincir kirildi -> dongu yok
            }
            $cursor = (int) $row['parent_id'];
        }

        // Sinira takildik: zincir beklenenden derin ya da mevcut veride dongu var.
        // Yeni bir dongu riskini almamak icin reddet.
        return true;
    }
}
