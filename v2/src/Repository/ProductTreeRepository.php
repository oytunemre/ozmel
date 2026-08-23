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
}
