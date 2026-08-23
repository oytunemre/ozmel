<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class AuditValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        // form'un DB varsayilani 'TQS'; gonderildiyse dogrula, zorunlu degil.
        $this->maxLength($input, 'form', 64, 'Form');

        if ($isCreate || array_key_exists('section', $input)) {
            $this->required($input, 'section', 'Bolum')
                 ->maxLength($input, 'section', 255, 'Bolum');
        }
        if ($isCreate || array_key_exists('question', $input)) {
            $this->required($input, 'question', 'Soru');
        }

        $this->numeric($input, 'score', 'Puan');

        return $this;
    }
}
