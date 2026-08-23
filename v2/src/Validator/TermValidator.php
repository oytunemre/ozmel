<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class TermValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('original', $input)) {
            $this->required($input, 'original', 'Orijinal terim')
                 ->maxLength($input, 'original', 255, 'Orijinal terim');
        }
        // Ceviri bos olabilir (v1'de de bos ceviri mumkundu); yalnizca uzunluk siniri.
        $this->maxLength($input, 'translation', 255, 'Ceviri');
        $this->boolean($input, 'isHidden', 'Gizli');
        return $this;
    }
}
