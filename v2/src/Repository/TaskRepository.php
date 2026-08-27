<?php
declare(strict_types=1);

namespace App\Repository;

use App\Core\BaseRepository;

final class TaskRepository extends BaseRepository
{
    protected function table(): string
    {
        return 'tasks';
    }

    protected function columns(): array
    {
        return [
            'sequence', 'description', 'department', 'primary_assignee_id',
            'secondary_assignee_id', 'priority', 'due_date', 'status',
            'completion_ratio', 'notes',
        ];
    }
}
