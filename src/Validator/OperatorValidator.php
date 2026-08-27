<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class OperatorValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('fullName', $input)) {
            $this->required($input, 'fullName', 'Operator adi')
                 ->maxLength($input, 'fullName', 128, 'Operator adi');
        }
        if ($isCreate || array_key_exists('badgeNo', $input)) {
            $this->required($input, 'badgeNo', 'Sicil no')
                 ->maxLength($input, 'badgeNo', 64, 'Sicil no');
        }
        $this->boolean($input, 'isActive', 'Aktif');

        if (array_key_exists('skills', $input)) {
            $this->skills($input['skills']);
        }
        return $this;
    }

    /** Yetkin operasyonlar: operasyon id dizisi, her eleman pozitif tam sayi. */
    private function skills(mixed $skills): void
    {
        if (!is_array($skills)) {
            $this->add('skills', 'Yetkin operasyonlar bir liste olmali');
            return;
        }
        foreach ($skills as $s) {
            if (!is_int($s) && !(is_string($s) && ctype_digit($s))) {
                $this->add('skills', 'Yetkin operasyon bir operasyon id olmali');
                return;
            }
            if ((int) $s <= 0) {
                $this->add('skills', 'Gecersiz operasyon id');
                return;
            }
        }
    }
}
