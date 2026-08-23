<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class WorkOrderValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('woNo', $input)) {
            $this->required($input, 'woNo', 'Is emri no')
                 ->maxLength($input, 'woNo', 64, 'Is emri no');
        }
        if ($isCreate || array_key_exists('orderId', $input)) {
            $this->required($input, 'orderId', 'Siparis')
                 ->positiveInt($input, 'orderId', 'Siparis');
        }
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }
        if ($isCreate || array_key_exists('targetQuantity', $input)) {
            $this->required($input, 'targetQuantity', 'Hedef miktar')
                 ->numeric($input, 'targetQuantity', 'Hedef miktar');
        }
        if ($isCreate || array_key_exists('status', $input)) {
            $this->required($input, 'status', 'Durum')
                 ->maxLength($input, 'status', 32, 'Durum');
        }

        // Opsiyonel FK'ler ve alanlar (v1'de rota/split kaynakli).
        $this->positiveInt($input, 'operationId', 'Operasyon')
             ->positiveInt($input, 'workCenterId', 'Is merkezi')
             ->numeric($input, 'sequence', 'Sira')
             ->maxLength($input, 'splitLabel', 128, 'Split etiketi');

        return $this;
    }
}
