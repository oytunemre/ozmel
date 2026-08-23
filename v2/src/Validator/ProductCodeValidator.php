<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;
use App\Dto\ProductCode;

final class ProductCodeValidator extends Validator
{
    public const TYPES = ['Hammadde', 'Yarı Mamül', 'Ürün'];

    /**
     * Yalnizca Hammadde'de anlamli olan olcu alanlari (v1: sparse alanlar).
     * API anahtari => DB sutunu (mevcut satirdan okumak icin).
     */
    private const HAMMADDE_ONLY = [
        'outerDiameter'  => 'outer_diameter',
        'innerDiameter'  => 'inner_diameter',
        'materialLength' => 'material_length',
        'materialWeight' => 'material_weight',
    ];

    /**
     * @param array<string,mixed>|null $existing Guncellemede mevcut DB satiri. Tip'e
     *        bagli kural hem istekteki hem de kayitta ONCEDEN dolu olan olcu alanlarini
     *        gorur: yeni tip Hammadde degilse ve alan guncelleme sonrasi dolu kalacaksa
     *        reddedilir (sessiz veri kaybi yerine acik hata).
     */
    public function validate(array $input, bool $isCreate, ?array $existing = null): static
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

        // Tip'e gore kural: olcu alanlari yalnizca Hammadde'de dolu olabilir.
        // Guncelleme sonrasi "etkin" degere bakariz: istek alani gondermezse eski
        // deger kalir; bu yuzden Hammadde -> Urun donusumunde kayitta onceden dolu
        // olan alanlar da yakalanir. Reddedilenler tek tek raporlanir ki kullanici
        // hangi alanlari temizlemesi gerektigini gorsun.
        $type = $input['type'] ?? ($existing['type'] ?? null);
        if ($type !== null && $type !== 'Hammadde') {
            foreach (self::HAMMADDE_ONLY as $key => $col) {
                if ($this->effectivelyFilled($input, $key, $existing[$col] ?? null)) {
                    $this->add($key, "Tip '$type' oldugundan bu alan bos olmali — temizleyip tekrar deneyin");
                }
            }
        }

        return $this;
    }

    /**
     * Guncelleme sonrasi alan dolu kalacak mi?
     *   - Istek alani gonderdiyse: gonderilen deger belirleyicidir (bos string / null = temizleme).
     *   - Gondermediyse: mevcut kayittaki deger oldugu gibi kalir.
     */
    private function effectivelyFilled(array $input, string $key, mixed $existingValue): bool
    {
        $value = array_key_exists($key, $input) ? $input[$key] : $existingValue;
        return $value !== null && trim((string) $value) !== '';
    }
}
