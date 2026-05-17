<?php

class View
{
    public static function render(string $view, array $data = []): void
    {
        extract($data);

        $viewPath = APPROOT . '/views/' . $view . '.php';
        if (!file_exists($viewPath)) {
            throw new Exception("View {$view} not found.");
        }

        require $viewPath;
    }
}
