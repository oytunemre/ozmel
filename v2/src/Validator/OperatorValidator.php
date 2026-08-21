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

    /** Yetkin operasyonlar: string dizisi, her eleman dolu ve <=128 karakter. */
    private function skills(mixed $skills): void
    {
        if (!is_array($skills)) {
            $this->add('skills', 'Yetkin operasyonlar bir liste olmali');
            return;
        }
        foreach ($skills as $s) {
            if (!is_string($s) || trim($s) === '') {
                $this->add('skills', 'Yetkin operasyon adi bos olamaz');
                return;
            }
            if (mb_strlen($s) > 128) {
                $this->add('skills', 'Yetkin operasyon adi en fazla 128 karakter olabilir');
                return;
            }
        }
    }
}
