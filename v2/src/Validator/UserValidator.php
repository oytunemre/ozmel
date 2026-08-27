<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

/**
 * Uc mod: create (yeni hesap), update (ad + durum), password (sifre sifirlama).
 * Sifre en az 8 karakter; bcrypt 72 bayti askin kismi yok saydigi icin ust sinir 72.
 */
final class UserValidator extends Validator
{
    public function validate(array $input, string $mode): static
    {
        if ($mode === 'create') {
            $this->required($input, 'username', 'Kullanici adi')
                 ->maxLength($input, 'username', 64, 'Kullanici adi');
            $u = trim((string) ($input['username'] ?? ''));
            if ($u !== '' && !preg_match('/^[A-Za-z0-9._-]{3,}$/', $u)) {
                $this->add('username', 'Kullanici adi en az 3 karakter; harf, rakam ve . _ - kullanin');
            }
            $this->required($input, 'displayName', 'Ad Soyad')
                 ->maxLength($input, 'displayName', 128, 'Ad Soyad');
            $this->passwordRules($input);
        } elseif ($mode === 'update') {
            $this->required($input, 'displayName', 'Ad Soyad')
                 ->maxLength($input, 'displayName', 128, 'Ad Soyad')
                 ->boolean($input, 'isActive', 'Durum');
        } elseif ($mode === 'password') {
            $this->passwordRules($input);
        }
        return $this;
    }

    private function passwordRules(array $input): void
    {
        $this->required($input, 'password', 'Sifre')
             ->minLength($input, 'password', 8, 'Sifre')
             ->maxLength($input, 'password', 72, 'Sifre');
    }
}
