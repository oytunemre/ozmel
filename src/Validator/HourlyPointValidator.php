<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;
use App\Dto\HourlyPoint;

final class HourlyPointValidator extends Validator
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
        if ($isCreate || array_key_exists('measureLocation', $input)) {
            $this->required($input, 'measureLocation', 'Olcum yeri')
                 ->maxLength($input, 'measureLocation', 255, 'Olcum yeri');
        }
        if ($isCreate || array_key_exists('type', $input)) {
            $this->required($input, 'type', 'Tip')
                 ->inList($input, 'type', self::TYPES, 'Tip');
        }

        foreach (HourlyPoint::decimalKeys() as $key) {
            $this->numeric($input, $key, $key);
        }
        $this->maxLength($input, 'unit', 32, 'Birim');

        return $this;
    }
}
