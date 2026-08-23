<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;
use App\Dto\ProductCode;

final class ProductCodeValidator extends Validator
{
    public const TYPES = ['Hammadde', 'Yarı Mamül', 'Ürün'];

    /** Yalnizca Hammadde'de anlamli olan olcu alanlari (v1: sparse alanlar). */
    private const HAMMADDE_ONLY = ['outerDiameter', 'innerDiameter', 'materialLength', 'materialWeight'];

    /**
     * @param string|null $existingType Guncellemede mevcut kaydin tipi. Istemci `type`
     *        gondermezse tip'e bagli kural bu deger uzerinden uygulanir.
     */
    public function validate(array $input, bool $isCreate, ?string $existingType = null): static
    {
        if ($isCreate || array_key_exists('code', $input)) {
            $this->required($input, 'code', 'Kod')
                 ->maxLength($input, 'code', 64, 'Kod');
        }
        if ($isCreate || array_key_exists('name', $input)) {
            $this->required($input, 'name', 'Ad')
                 ->maxLength($input, 'name', 255, 'Ad');
        }
        if ($isCreate || array_key_exists('type', $input)) {
            $this->required($input, 'type', 'Tip')
                 ->inList($input, 'type', self::TYPES, 'Tip');
        }

        // Tum sayisal alanlar sayi (ya da bos) olmali.
        foreach (ProductCode::decimalKeys() as $key) {
            $this->numeric($input, $key, $key);
        }

        // Tip'e gore kural: olcu alanlari yalnizca Hammadde'de kabul edilir.
        $type = $input['type'] ?? $existingType;
        if ($type !== null && $type !== 'Hammadde') {
            foreach (self::HAMMADDE_ONLY as $key) {
                if ($this->hasValue($input, $key)) {
                    $this->add($key, 'Bu alan yalnizca Hammadde tipinde girilebilir');
                }
            }
        }

        return $this;
    }

    /** Alan gonderilmis VE bos degil mi? Bos string / null "temizleme" sayilir, reddedilmez. */
    private function hasValue(array $input, string $key): bool
    {
        return array_key_exists($key, $input)
            && $input[$key] !== null
            && !(is_string($input[$key]) && trim($input[$key]) === '');
    }
}
