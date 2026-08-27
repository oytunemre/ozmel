<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class CapacityValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }
        if ($isCreate || array_key_exists('workCenterId', $input)) {
            $this->required($input, 'workCenterId', 'Is merkezi')
                 ->positiveInt($input, 'workCenterId', 'Is merkezi');
        }
        if ($isCreate || array_key_exists('capacityPerShift', $input)) {
            $this->required($input, 'capacityPerShift', 'Kapasite')
                 ->numeric($input, 'capacityPerShift', 'Kapasite');
        }
        // Dakika opsiyonel; verildiyse sayi olmali.
        $this->numeric($input, 'minutes', 'Dakika');
        return $this;
    }
}
