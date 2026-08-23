<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class OrderValidator extends Validator
{
    public const SOURCES = ['satis', 'uretim', 'stok'];

    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('orderNo', $input)) {
            $this->required($input, 'orderNo', 'Siparis no')
                 ->maxLength($input, 'orderNo', 64, 'Siparis no');
        }
        if ($isCreate || array_key_exists('source', $input)) {
            $this->required($input, 'source', 'Kaynak')
                 ->inList($input, 'source', self::SOURCES, 'Kaynak');
        }
        if ($isCreate || array_key_exists('status', $input)) {
            $this->required($input, 'status', 'Durum')
                 ->maxLength($input, 'status', 32, 'Durum');
        }
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }
        if ($isCreate || array_key_exists('targetQuantity', $input)) {
            $this->required($input, 'targetQuantity', 'Hedef miktar')
                 ->numeric($input, 'targetQuantity', 'Hedef miktar');
        }

        $this->maxLength($input, 'customer', 255, 'Musteri')
             ->maxLength($input, 'salesOrderNo', 64, 'Satis siparis no')
             ->date($input, 'startDate', 'Baslangic tarihi')
             ->date($input, 'requestedDeliveryDate', 'Istenen teslim tarihi');

        return $this;
    }
}
