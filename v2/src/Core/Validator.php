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

    /** Bos ('' / null) gecerlidir — zorunluluk ayri kontrol edilir. Aksi halde pozitif tam sayi (FK id) olmali. */
    public function positiveInt(array $data, string $field, string $label): static
    {
        if (isset($data[$field]) && !(is_string($data[$field]) && trim($data[$field]) === '')) {
            $v = $data[$field];
            $ok = (is_int($v) && $v > 0) || (is_string($v) && ctype_digit($v) && (int) $v > 0);
            if (!$ok) {
                $this->errors[$field] = "$label gecerli bir kayit olmali";
            }
        }
        return $this;
    }

    /** Bos ('' / null) gecerlidir — zorunluluk ayri kontrol edilir. Aksi halde sayi olmali. */
    public function numeric(array $data, string $field, string $label): static
    {
        if (isset($data[$field]) && !(is_string($data[$field]) && trim($data[$field]) === '') && !is_numeric($data[$field])) {
            $this->errors[$field] = "$label sayi olmali";
        }
        return $this;
    }

    /** Tarih: 'YYYY-MM-DD'. Bos degilse bicim kontrol edilir. */
    public function date(array $data, string $field, string $label): static
    {
        if (isset($data[$field]) && trim((string) $data[$field]) !== ''
            && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $data[$field])) {
            $this->errors[$field] = "$label tarih bicimi olmali (YYYY-AA-GG)";
        }
        return $this;
    }

    /** Saat: 'HH:MM' veya 'HH:MM:SS' (00-23 / 00-59). Bos degilse bicim kontrol edilir. */
    public function time(array $data, string $field, string $label): static
    {
        if (isset($data[$field]) && trim((string) $data[$field]) !== ''
            && !preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', (string) $data[$field])) {
            $this->errors[$field] = "$label saat bicimi olmali (SS:DD)";
        }
        return $this;
    }

    /** @param list<string> $allowed */
    public function inList(array $data, string $field, array $allowed, string $label): static
    {
        if (isset($data[$field]) && !in_array($data[$field], $allowed, true)) {
            $this->errors[$field] = "$label gecersiz — kabul edilenler: " . implode(', ', $allowed);
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
