<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class AuditRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'audits';
    }

    protected function columns(): array
    {
        return ['form', 'section', 'question', 'score', 'evidence'];
    }
}
