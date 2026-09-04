<?php
declare(strict_types=1);

namespace App\Validator;

use App\Core\Validator;

final class TaskValidator extends Validator
{
    public function validate(array $input, bool $isCreate): static
    {
        if ($isCreate || array_key_exists('description', $input)) {
            $this->required($input, 'description', 'Gorev tanimi');
        }

        $this->numeric($input, 'sequence', 'Sira')
             ->maxLength($input, 'department', 128, 'Departman')
             ->positiveInt($input, 'primaryAssigneeId', 'Ana sorumlu')
             ->positiveInt($input, 'secondaryAssigneeId', 'Yardimci')
             ->maxLength($input, 'priority', 32, 'Oncelik')
             ->date($input, 'dueDate', 'Termin')
             ->maxLength($input, 'status', 32, 'Durum')
             ->inList($input, 'status', ['Başlamadı', 'Devam Ediyor', 'Beklemede', 'Tamamlandı'], 'Durum')
             ->numeric($input, 'completionRatio', 'Tamamlanma orani');

        // Tamamlanma orani 0–1 arasi kesir (yuzde degil).
        if (isset($input['completionRatio']) && is_numeric($input['completionRatio'])) {
            $r = (float) $input['completionRatio'];
            if ($r < 0 || $r > 1) {
                $this->add('completionRatio', 'Tamamlanma orani 0 ile 1 arasinda olmali (1 = %100)');
            }
        }

        return $this;
    }
}
