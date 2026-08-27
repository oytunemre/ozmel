<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class FirstOffRecordValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('productCodeId', $input)) {
            $this->required($input, 'productCodeId', 'Urun kodu')
                 ->positiveInt($input, 'productCodeId', 'Urun kodu');
        }
        if ($isCreate || array_key_exists('operationId', $input)) {
            $this->required($input, 'operationId', 'Operasyon')
                 ->positiveInt($input, 'operationId', 'Operasyon');
        }
        if ($isCreate || array_key_exists('date', $input)) {
            $this->required($input, 'date', 'Tarih')
                 ->date($input, 'date', 'Tarih');
        }
        if ($isCreate || array_key_exists('shift', $input)) {
            $this->required($input, 'shift', 'Vardiya')
                 ->maxLength($input, 'shift', 24, 'Vardiya');
        }

        $this->maxLength($input, 'operatorName', 255, 'Operator')
             ->maxLength($input, 'woNo', 64, 'Is emri no')
             ->numeric($input, 'sampleCount', 'Numune adedi')
             ->time($input, 'checkTime', 'Kontrol saati')
             ->maxLength($input, 'overallResult', 32, 'Genel karar');

        if (array_key_exists('measurements', $input)) {
            $this->measurements($input['measurements']);
        }
        if (array_key_exists('reasons', $input)) {
            $this->reasons($input['reasons']);
        }

        return $this;
    }

    /** Olcumler: nesne dizisi, her biri {pointId (pozitif int), value (sayi|bos), result (metin)}. */
    private function measurements(mixed $measurements): void
    {
        if (!is_array($measurements)) {
            $this->add('measurements', 'Olcumler bir liste olmali');
            return;
        }
        foreach ($measurements as $m) {
            if (!is_array($m)) {
                $this->add('measurements', 'Her olcum bir nesne olmali');
                return;
            }
            $pointId = $m['pointId'] ?? null;
            if (!is_int($pointId) && !(is_string($pointId) && ctype_digit($pointId))) {
                $this->add('measurements', 'Olcum icin gecerli bir nokta id gerekli');
                return;
            }
            if ((int) $pointId <= 0) {
                $this->add('measurements', 'Gecersiz nokta id');
                return;
            }
            if (isset($m['value']) && !(is_string($m['value']) && trim($m['value']) === '') && !is_numeric($m['value'])) {
                $this->add('measurements', 'Olcum degeri sayi olmali');
                return;
            }
        }
    }

    /** Gerekceler: string dizisi, her eleman bos olmayan <=255 karakter. */
    private function reasons(mixed $reasons): void
    {
        if (!is_array($reasons)) {
            $this->add('reasons', 'Gerekceler bir liste olmali');
            return;
        }
        foreach ($reasons as $r) {
            if (!is_string($r) && !is_numeric($r)) {
                $this->add('reasons', 'Gerekce metin olmali');
                return;
            }
            if (mb_strlen((string) $r) > 255) {
                $this->add('reasons', 'Gerekce en fazla 255 karakter olabilir');
                return;
            }
        }
    }
}
