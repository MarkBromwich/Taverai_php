<?php

$config = [
    'host' => env_required('DB_HOST'),
    'dbname' => env_required('DB_NAME'),
    'username' => env_required('DB_USER'),
    'password' => env_required('DB_PASSWORD'),
    'charset' => 'utf8mb4',
];

$port = env_value('DB_PORT');
if ($port !== null && $port !== '') {
    $config['port'] = (int) $port;
}

return $config;
