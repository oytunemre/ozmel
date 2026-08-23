<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class PurchaseRequestValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        // Malzeme zorunlu FK (listeden secilir, serbest metin degil).
        if ($isCreate || array_key_exists('materialCodeId', $input)) {
            $this->required($input, 'materialCodeId', 'Malzeme kodu')
                 ->positiveInt($input, 'materialCodeId', 'Malzeme kodu');
        }

        $this->positiveInt($input, 'productCodeId', 'Urun kodu')
             ->positiveInt($input, 'orderId', 'Siparis')
             ->numeric($input, 'quantity', 'Miktar')
             ->maxLength($input, 'unit', 32, 'Birim')
             ->maxLength($input, 'supplier', 255, 'Tedarikci')
             ->date($input, 'requestDate', 'Istek tarihi')
             ->date($input, 'expectedDate', 'Beklenen tarih');

        return $this;
    }
}
