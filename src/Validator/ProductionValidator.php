<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class ProductionValidator extends Validator
{
    public const SHIFTS = ['Sabah', 'Öğleden Sonra', 'Mesai'];

    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('workOrderId', $input)) {
            $this->required($input, 'workOrderId', 'Is emri')
                 ->positiveInt($input, 'workOrderId', 'Is emri');
        }
        if ($isCreate || array_key_exists('date', $input)) {
            $this->required($input, 'date', 'Tarih')
                 ->date($input, 'date', 'Tarih');
        }
        if ($isCreate || array_key_exists('shift', $input)) {
            $this->required($input, 'shift', 'Vardiya')
                 ->inList($input, 'shift', self::SHIFTS, 'Vardiya');
        }
        if ($isCreate || array_key_exists('actualQuantity', $input)) {
            $this->required($input, 'actualQuantity', 'Gercek adet')
                 ->numeric($input, 'actualQuantity', 'Gercek adet');
        }
        if ($isCreate || array_key_exists('scrapQuantity', $input)) {
            $this->required($input, 'scrapQuantity', 'Fire adet')
                 ->numeric($input, 'scrapQuantity', 'Fire adet');
        }

        // Hedef adet v1'de zorunlu ama null olabilir; opsiyonel sayi.
        $this->numeric($input, 'targetQuantity', 'Hedef adet')
             ->positiveInt($input, 'operatorId', 'Operator')
             ->time($input, 'downtimeStart', 'Durus baslangic')
             ->time($input, 'downtimeEnd', 'Durus bitis')
             ->positiveInt($input, 'downtimeReasonId', 'Durus nedeni');

        // Durus baslangic/bitis birlikte girilmeli (biri varsa digeri de).
        $hasStart = isset($input['downtimeStart']) && trim((string) $input['downtimeStart']) !== '';
        $hasEnd   = isset($input['downtimeEnd'])   && trim((string) $input['downtimeEnd'])   !== '';
        if ($hasStart !== $hasEnd) {
            $this->add($hasStart ? 'downtimeEnd' : 'downtimeStart', 'Durus baslangic ve bitis birlikte girilmeli');
        }

        return $this;
    }
}
