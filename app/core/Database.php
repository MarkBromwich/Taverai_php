<?php

class Database
{
    private static ?PDO $connection = null;

    public static function connect(): PDO
    {
        if (self::$connection === null) {
            $config = $GLOBALS['db_config'] ?? [];

            $dsn = sprintf(
                'mysql:host=%s;%sdbname=%s;charset=%s',
                $config['host'] ?? 'localhost',
                isset($config['port']) ? 'port=' . $config['port'] . ';' : '',
                $config['dbname'] ?? '',
                $config['charset'] ?? 'utf8mb4'
            );

            self::$connection = new PDO(
                $dsn,
                $config['username'] ?? '',
                $config['password'] ?? '',
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => 5,
                ]
            );
        }

        return self::$connection;
    }
}
