<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;
use App\Dto\ProductTree;

final class ProductTreeValidator extends Validator
{
    /**
     * @param int|null $selfId Guncellenen dugumun id'si. Dugum kendi kendine parent
     *        OLAMAZ (FK bunu yakalamaz) — verilirse parentId == selfId reddedilir.
     */
    public function validate(array $input, bool $isCreate, ?int $selfId = null): static
    {
        // Dugumun urunu zorunlu FK.
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }

        // Ust dugum ve hammadde opsiyonel FK.
        $this->positiveInt($input, 'parentId', 'Ust dugum')
             ->positiveInt($input, 'materialCodeId', 'Malzeme kodu')
             ->maxLength($input, 'materialDescription', 255, 'Malzeme aciklamasi')
             ->maxLength($input, 'description', 255, 'Aciklama')
             ->maxLength($input, 'revision', 32, 'Revizyon');

        // Dongu korumasi: kendi kendine parent olamaz.
        if ($selfId !== null && array_key_exists('parentId', $input) && (int) $input['parentId'] === $selfId) {
            $this->add('parentId', 'Bir dugum kendi kendine ust dugum olamaz');
        }

        foreach (ProductTree::decimalKeys() as $key) {
            $this->numeric($input, $key, $key);
        }

        return $this;
    }
}
