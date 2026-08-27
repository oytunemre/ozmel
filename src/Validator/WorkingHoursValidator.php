<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;
use App\Dto\WorkingHours;

/**
 * Tek-satir konfig: yalnizca guncelleme var (store/destroy yok). Gonderilen her
 * zaman alani 'SS:DD' biciminde olmali. Alan gonderilmezse mevcut deger korunur
 * (kismi guncelleme) — bu yuzden $isCreate yalnizca imza tutarliligi icin durur.
 */
final class WorkingHoursValidator extends Validator
{
    public function validate(array $input, bool $isCreate = false): static
    {
        foreach (array_keys(WorkingHours::FIELDS) as $key) {
            if (array_key_exists($key, $input)) {
                $this->required($input, $key, 'Saat')
                     ->time($input, $key, 'Saat');
            }
        }
        return $this;
    }
}
