<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class MachinePlanValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('date', $input)) {
            $this->required($input, 'date', 'Tarih')
                 ->date($input, 'date', 'Tarih');
        }
        if ($isCreate || array_key_exists('workCenterId', $input)) {
            $this->required($input, 'workCenterId', 'Is merkezi')
                 ->positiveInt($input, 'workCenterId', 'Is merkezi');
        }
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }

        // Opsiyonel: is emri baglantisi ve hedef miktar.
        $this->positiveInt($input, 'workOrderId', 'Is emri')
             ->numeric($input, 'targetQuantity', 'Hedef miktar');

        return $this;
    }
}
