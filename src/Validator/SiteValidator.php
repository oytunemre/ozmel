<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

/**
 * Tedarikci sitesi dogrulama. Zorunlu alan yalnizca supplier; diger alanlar serbest.
 * E-posta alanlari bicim kontrolu (bos gecerli).
 */
final class SiteValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('supplier', $input)) {
            $this->required($input, 'supplier', 'Tedarikçi')
                 ->maxLength($input, 'supplier', 255, 'Tedarikçi');
        }
        $this->maxLength($input, 'trigoRE', 128, 'Trigo RE')
             ->maxLength($input, 'sqe', 128, 'SQE')
             ->maxLength($input, 'sqm', 128, 'SQM')
             ->maxLength($input, 'country', 128, 'Ülke')
             ->maxLength($input, 'city', 128, 'Şehir')
             ->maxLength($input, 'siteCode', 64, 'Site kodu')
             ->email($input, 'sqeEmail', 'SQE e-posta')
             ->email($input, 'sqmEmail', 'SQM e-posta');
        return $this;
    }
}
