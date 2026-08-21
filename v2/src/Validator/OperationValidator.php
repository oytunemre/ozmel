<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class OperationValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('name', $input)) {
            $this->required($input, 'name', 'Operasyon adi')
                 ->maxLength($input, 'name', 128, 'Operasyon adi');
        }
        return $this;
    }
}
