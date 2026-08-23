<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class RouteValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        // Zorunlu FK'ler: urun, operasyon, is merkezi.
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }
        if ($isCreate || array_key_exists('operationId', $input)) {
            $this->required($input, 'operationId', 'Operasyon')
                 ->positiveInt($input, 'operationId', 'Operasyon');
        }
        if ($isCreate || array_key_exists('workCenterId', $input)) {
            $this->required($input, 'workCenterId', 'Is merkezi')
                 ->positiveInt($input, 'workCenterId', 'Is merkezi');
        }
        if ($isCreate || array_key_exists('sequence', $input)) {
            $this->required($input, 'sequence', 'Sira')
                 ->numeric($input, 'sequence', 'Sira');
        }

        $this->boolean($input, 'isActive', 'Aktif')
             ->maxLength($input, 'variantLabel', 128, 'Varyant etiketi');

        if (array_key_exists('variants', $input)) {
            $this->variants($input['variants']);
        }
        return $this;
    }

    /** Varyant secenekleri: string dizisi, her eleman bos olmayan <=128 karakter. */
    private function variants(mixed $variants): void
    {
        if (!is_array($variants)) {
            $this->add('variants', 'Varyant secenekleri bir liste olmali');
            return;
        }
        foreach ($variants as $v) {
            if (!is_string($v) && !is_numeric($v)) {
                $this->add('variants', 'Varyant secenegi metin olmali');
                return;
            }
            if (trim((string) $v) === '') {
                $this->add('variants', 'Varyant secenegi bos olamaz');
                return;
            }
            if (mb_strlen((string) $v) > 128) {
                $this->add('variants', 'Varyant secenegi en fazla 128 karakter olabilir');
                return;
            }
        }
    }
}
