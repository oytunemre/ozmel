<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Basit alan dogrulayici. Hata biriktirir, ilkinde durmaz —
 * kullanici tum eksikleri tek seferde gorur.
 */
class Validator
{
    /** @var array<string,string> */
    protected array $errors = [];

    public function required(array $data, string $field, string $label): static
    {
        $value = $data[$field] ?? '';
        if (!is_array($value) && trim((string) $value) === '') {
            $this->errors[$field] = "$label zorunlu";
        }
        return $this;
    }

    public function maxLength(array $data, string $field, int $max, string $label): static
    {
        if (isset($data[$field]) && mb_strlen((string) $data[$field]) > $max) {
            $this->errors[$field] = "$label en fazla $max karakter olabilir";
        }
        return $this;
    }

    public function boolean(array $data, string $field, string $label): static
    {
        if (isset($data[$field]) && !is_bool($data[$field]) && !in_array($data[$field], [0, 1, '0', '1'], true)) {
            $this->errors[$field] = "$label evet/hayir olmali";
        }
        return $this;
    }

    public function add(string $field, string $message): static
    {
        $this->errors[$field] = $message;
        return $this;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    /** @return array<string,string> */
    public function errors(): array
    {
        return $this->errors;
    }
}
