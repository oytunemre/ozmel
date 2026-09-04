<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class SiteRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'sites';
    }

    protected function columns(): array
    {
        return ['supplier', 'trigo_re', 'sqe', 'sqe_email', 'sqm', 'sqm_email', 'country', 'city', 'site_code'];
    }
}
