<?php

class Router
{
    private array $routes = [];

    public function get(string $path, string $handler): void
    {
        $this->map('GET', $path, $handler);
    }

    public function post(string $path, string $handler): void
    {
        $this->map('POST', $path, $handler);
    }

    public function put(string $path, string $handler): void
    {
        $this->map('PUT', $path, $handler);
    }

    public function patch(string $path, string $handler): void
    {
        $this->map('PATCH', $path, $handler);
    }

    public function delete(string $path, string $handler): void
    {
        $this->map('DELETE', $path, $handler);
    }

    private function map(string $method, string $path, string $handler): void
    {
        $this->routes[] = [
            'method' => $method,
            'path' => $path,
            'handler' => $handler,
        ];
    }

    public function dispatch(string $method, string $uri): void
    {
        $path = $_GET['path'] ?? null;

        if (!$path) {
            $path = parse_url($uri, PHP_URL_PATH) ?: '/';
            $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';

            if ($scriptName && $scriptName !== '/' && str_starts_with($path, $scriptName)) {
                $path = substr($path, strlen($scriptName)) ?: '/';
            }

            $scriptDir = $scriptName ? str_replace('\\', '/', dirname($scriptName)) : '';
            if ($scriptDir && $scriptDir !== '/' && $scriptDir !== '.' && str_starts_with($path, $scriptDir)) {
                $path = substr($path, strlen($scriptDir)) ?: '/';
            }

            $base = defined('BASE_URL') ? trim((string) BASE_URL, '/') : '';
            if ($base !== '') {
                $basePath = '/' . $base;
                if ($path === $basePath) {
                    $path = '/';
                } elseif (str_starts_with($path, $basePath . '/')) {
                    $path = substr($path, strlen($basePath)) ?: '/';
                }
            }
        }

        if ($path && $path[0] !== '/') {
            $path = '/' . $path;
        }

        if (!$path) {
            $path = '/';
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }

            $pattern = preg_replace('#\{[a-zA-Z_][a-zA-Z0-9_]*\}#', '([^/]+)', $route['path']);
            $pattern = '#^' . $pattern . '$#';

            if (preg_match($pattern, $path, $matches)) {
                array_shift($matches);
                [$controllerName, $action] = explode('@', $route['handler']);

                if (!class_exists($controllerName)) {
                    http_response_code(500);
                    echo 'Controller not found.';
                    return;
                }

                $controller = new $controllerName();

                if (!method_exists($controller, $action)) {
                    http_response_code(500);
                    echo 'Action not found.';
                    return;
                }

                call_user_func_array([$controller, $action], $matches);
                return;
            }
        }

        http_response_code(404);
        $controller = new Controller();
        $controller->view('pages/404', ['title' => 'Page Not Found']);
    }
}
