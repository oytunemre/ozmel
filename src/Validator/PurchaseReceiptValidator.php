<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class PurchaseReceiptValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        // Giris bir istege baglidir (zorunlu FK).
        if ($isCreate || array_key_exists('purchaseRequestId', $input)) {
            $this->required($input, 'purchaseRequestId', 'Satinalma istegi')
                 ->positiveInt($input, 'purchaseRequestId', 'Satinalma istegi');
        }

        $this->date($input, 'date', 'Tarih')
             ->numeric($input, 'quantity', 'Miktar');

        return $this;
    }
}
