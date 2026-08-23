<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;
use App\Dto\FirstOffPoint;

final class FirstOffPointValidator extends Validator
{
    public const TYPES = ['olcusel', 'nitel'];

    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }
        if ($isCreate || array_key_exists('operationId', $input)) {
            $this->required($input, 'operationId', 'Operasyon')
                 ->positiveInt($input, 'operationId', 'Operasyon');
        }
        if ($isCreate || array_key_exists('pointNo', $input)) {
            $this->required($input, 'pointNo', 'Nokta no')
                 ->numeric($input, 'pointNo', 'Nokta no');
        }
        if ($isCreate || array_key_exists('characteristic', $input)) {
            $this->required($input, 'characteristic', 'Karakteristik')
                 ->maxLength($input, 'characteristic', 255, 'Karakteristik');
        }
        if ($isCreate || array_key_exists('type', $input)) {
            $this->required($input, 'type', 'Tip')
                 ->inList($input, 'type', self::TYPES, 'Tip');
        }

        foreach (FirstOffPoint::decimalKeys() as $key) {
            $this->numeric($input, $key, $key);
        }
        $this->maxLength($input, 'unit', 32, 'Birim');

        return $this;
    }
}
