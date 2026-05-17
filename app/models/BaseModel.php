<?php

class BaseModel
{
    protected ?PDO $db = null;

    protected function db(): ?PDO
    {
        if ($this->db !== null) {
            return $this->db;
        }

        try {
            $this->db = Database::connect();
        } catch (Throwable $e) {
            app_log('Database connection failed', ['error' => $e->getMessage()]);
            $this->db = null;
        }

        return $this->db;
    }
}
