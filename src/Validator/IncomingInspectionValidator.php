<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class IncomingInspectionValidator extends Validator
{
    public const TYPES = ['olcusel', 'nitel'];

    public function validate(array $input, bool $isCreate): static
    {
        // Ana alanlar: sema hepsini NULL kabul eder; yalnizca bicim/uzunluk kontrolu.
        $this->maxLength($input, 'legacyPurchaseReceiptId', 16, 'Satinalma giris referansi')
             ->positiveInt($input, 'purchaseReceiptId', 'Satinalma girisi')
             ->maxLength($input, 'supplier', 255, 'Tedarikci')
             ->positiveInt($input, 'materialCodeId', 'Malzeme kodu')
             ->maxLength($input, 'drawingNo', 128, 'Cizim no')
             ->maxLength($input, 'reason', 255, 'Gozlem nedeni')
             ->date($input, 'arrivalDate', 'Malzeme gelis tarihi')
             ->date($input, 'inspectionDate', 'Kontrol tarihi')
             ->numeric($input, 'receivedQty', 'Gelen adet')
             ->numeric($input, 'sampleQty', 'Ornek adedi')
             ->maxLength($input, 'inspectorName', 255, 'Kontrol eden')
             ->maxLength($input, 'overallResult', 32, 'Genel sonuc');

        if (array_key_exists('characteristics', $input)) {
            $this->characteristics($input['characteristics']);
        }

        return $this;
    }

    /** Karakteristikler: [{charNo, name, type, ...limitler, values[]}]. */
    private function characteristics(mixed $characteristics): void
    {
        if (!is_array($characteristics)) {
            $this->add('characteristics', 'Karakteristikler bir liste olmali');
            return;
        }
        foreach ($characteristics as $c) {
            if (!is_array($c)) {
                $this->add('characteristics', 'Her karakteristik bir nesne olmali');
                return;
            }
            if (trim((string) ($c['name'] ?? '')) === '') {
                $this->add('characteristics', 'Karakteristik adi zorunlu');
                return;
            }
            if (!in_array($c['type'] ?? null, self::TYPES, true)) {
                $this->add('characteristics', "Karakteristik tipi gecersiz — kabul edilenler: " . implode(', ', self::TYPES));
                return;
            }
            if (array_key_exists('values', $c) && !is_array($c['values'])) {
                $this->add('characteristics', 'Karakteristik degerleri bir liste olmali');
                return;
            }
            // Deger sayi (olcusel) ya da kisa metin (nitel sonuc, or. 'Uygun') olabilir.
            foreach (($c['values'] ?? []) as $v) {
                if (is_string($v) && !is_numeric($v) && mb_strlen(trim($v)) > 24) {
                    $this->add('characteristics', 'Nitel deger en fazla 24 karakter olabilir');
                    return;
                }
            }
        }
    }
}
