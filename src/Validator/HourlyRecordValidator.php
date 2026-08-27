<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class HourlyRecordValidator extends Validator
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

        $this->time($input, 'hour', 'Saat')
             ->maxLength($input, 'personnelName', 255, 'Personel')
             ->maxLength($input, 'machineName', 255, 'Makina')
             ->numeric($input, 'productionCount', 'Uretim adedi');

        if (array_key_exists('measurements', $input)) {
            $this->measurements($input['measurements']);
        }

        return $this;
    }

    /** Olcumler: [{pointId (pozitif int), values (sayi|bos elemanli dizi)}]. */
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
            if (array_key_exists('values', $m) && !is_array($m['values'])) {
                $this->add('measurements', 'Olcum degerleri bir liste olmali');
                return;
            }
            foreach (($m['values'] ?? []) as $v) {
                if ($v !== null && !(is_string($v) && trim($v) === '') && !is_numeric($v)) {
                    $this->add('measurements', 'Olcum degeri sayi olmali');
                    return;
                }
            }
        }
    }
}
