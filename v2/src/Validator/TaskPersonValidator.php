<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class TaskPersonValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('name', $input)) {
            $this->required($input, 'name', 'Isim')
                 ->maxLength($input, 'name', 255, 'Isim');
        }
        $this->maxLength($input, 'email', 255, 'Eposta')
             ->maxLength($input, 'phone', 64, 'Telefon');
        return $this;
    }
}
