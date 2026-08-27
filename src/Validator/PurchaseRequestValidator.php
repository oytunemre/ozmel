<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class PurchaseRequestValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        // Malzeme OPSIYONEL: verilirse gecerli bir FK olmali. Eslesmeyen serbest metin
        // ETL'de note'a yazilir, material_code_id NULL kalir (bkz. migration 028).
        $this->positiveInt($input, 'materialCodeId', 'Malzeme kodu')
             ->positiveInt($input, 'productCodeId', 'Urun kodu')
             ->positiveInt($input, 'orderId', 'Siparis')
             ->numeric($input, 'quantity', 'Miktar')
             ->maxLength($input, 'unit', 32, 'Birim')
             ->maxLength($input, 'supplier', 255, 'Tedarikci')
             ->date($input, 'requestDate', 'Istek tarihi')
             ->date($input, 'expectedDate', 'Beklenen tarih');

        return $this;
    }
}
