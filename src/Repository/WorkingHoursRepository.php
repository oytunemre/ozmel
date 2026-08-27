<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\SingletonRepository;

/**
 * Tek-satir konfig (firma basina bir kayit). CRUD yok; find/update tenant_id ile
 * SingletonRepository uzerinden. Satir migration'da tohumlanir, hep vardir.
 */
final class WorkingHoursRepository extends SingletonRepository
{
    protected function table(): string
    {
        return 'working_hours';
    }

    protected function columns(): array
    {
        return [
            'morning_start', 'morning_break_start', 'morning_break_end', 'morning_end',
            'afternoon_start', 'afternoon_break_start', 'afternoon_break_end', 'afternoon_end',
        ];
    }
}
