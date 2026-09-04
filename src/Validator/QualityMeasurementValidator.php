<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

/**
 * Kalite olcumu dogrulama (yalnizca create — append-only).
 * orderId + controlPlanId zorunlu; result Uygun/Uygun Değil; value nitel maddede bos olabilir.
 */
final class QualityMeasurementValidator extends Validator
{
    public function validate(array $input): static
    {
        $this->required($input, 'orderId', 'Sipariş')->positiveInt($input, 'orderId', 'Sipariş');
        $this->required($input, 'controlPlanId', 'Kontrol planı maddesi')->positiveInt($input, 'controlPlanId', 'Kontrol planı maddesi');
        $this->required($input, 'result', 'Sonuç')->inList($input, 'result', ['Uygun', 'Uygun Değil'], 'Sonuç');

        if (array_key_exists('value', $input) && $input['value'] !== null && $input['value'] !== '') {
            $this->numeric($input, 'value', 'Değer');
        }
        if (array_key_exists('measuredAt', $input) && $input['measuredAt'] !== null && $input['measuredAt'] !== '') {
            $this->date($input, 'measuredAt', 'Tarih');
        }
        $this->maxLength($input, 'shift', 16, 'Vardiya');
        $this->maxLength($input, 'operator', 128, 'Operatör');
        return $this;
    }
}
