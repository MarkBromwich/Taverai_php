<?php

class HomeController extends Controller
{
    public function index(): void
    {
        if (current_user_id() !== null) {
            header('Location: ' . route_url('log'));
            exit;
        }

        header('Location: ' . route_url('login'));
        exit;
    }

    public function login(): void
    {
        if (current_user_id() !== null) {
            header('Location: ' . route_url('log'));
            exit;
        }
        $this->renderAppPage('login', 'Welcome back', 'Sign in to continue your tracking streak and keep the app-like flow intact.');
    }

    public function signup(): void
    {
        if (current_user_id() !== null) {
            header('Location: ' . route_url('log'));
            exit;
        }
        $this->renderAppPage('signup', 'Create your Taverai account', 'A clean first-pass PHP signup flow, backed by MySQL and ready for shared hosting.');
    }

    public function forgot(): void
    {
        if (current_user_id() !== null) {
            header('Location: ' . route_url('log'));
            exit;
        }
        $this->renderAppPage('forgot', 'Reset password', 'Enter the email tied to your account and we will generate a reset path for this PHP port.');
    }

    public function reset(): void
    {
        $this->renderAppPage('reset', 'Set a new password', 'Use the reset token to save a new password without leaving the PHP app shell.');
    }

    public function log(): void
    {
        $this->renderAppPage('log', 'Daily log', '');
    }

    public function menu(): void
    {
        $this->renderAppPage('menu', 'Menu & Meal Planner', 'Compare restaurant options, build meals around your plan, and save favorites you can use again.');
    }

    public function favorites(): void
    {
        $this->renderAppPage('favorites', 'Favorite Meals', 'Browse saved meals by type and open printable recipes when you need them.');
    }

    public function plans(): void
    {
        $this->renderAppPage('plans', 'Your plans', 'Choose from seeded templates or create custom plans against the new PHP backend.');
    }

    public function account(): void
    {
        $this->renderAppPage('account', 'Account settings', 'Update profile and preferences while we continue porting the rest of the original app.');
    }

    public function coach(): void
    {
        $this->renderAppPage('coach', 'Coach', 'Review your trends, understand what is working, and get practical ideas for your next meals.');
    }

    public function admin(): void
    {
        $this->requireAdmin();
        $this->renderAppPage('admin', 'Admin', 'Monitor users, food activity, plans, and system readiness from one quiet control room.');
    }

    private function renderAppPage(string $page, string $heading, string $subheading): void
    {
        $isAdmin = false;
        $userId = current_user_id();
        if ($userId !== null) {
            $user = $this->model('UserModel')->findWithPreferences($userId);
            $isAdmin = ($user['role'] ?? 'user') === 'admin';
        }

        $this->view('pages/app-shell', [
            'title' => ucfirst($page) . ' | Taverai',
            'page' => $page,
            'heading' => $heading,
            'subheading' => $subheading,
            'isAuthenticated' => current_user_id() !== null,
            'isAdmin' => $isAdmin,
        ]);
    }
}
