<?php
if (!function_exists('taverai_nav_icon')) {
    function taverai_nav_icon(string $name): string
    {
        $icons = [
            'log' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 8H20"/><path d="M8 3v14"/></svg>',
            'coach' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3a3 3 0 0 0-3 3v.2A3 3 0 0 0 4 9a3 3 0 0 0 1.2 2.4A3.3 3.3 0 0 0 5 13a3 3 0 0 0 3 3h1V3Z"/><path d="M15 3a3 3 0 0 1 3 3v.2A3 3 0 0 1 20 9a3 3 0 0 1-1.2 2.4A3.3 3.3 0 0 1 19 13a3 3 0 0 1-3 3h-1V3Z"/><path d="M9 9H7"/><path d="M15 9h2"/><path d="M9 16v2a3 3 0 0 0 6 0v-2"/><path d="M12 3v18"/></svg>',
            'menu' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 3 7 7"/><path d="m5 4 7 7"/><path d="M4 10h6V4"/><path d="m13 12 7 7"/><path d="M19 3 5 17a2.8 2.8 0 0 0 4 4L23 7"/></svg>',
            'plans' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8"/><path d="M9 2h6v4H9z"/><path d="M6 5H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1"/><path d="M8 11h8"/><path d="M8 15h8"/></svg>',
            'account' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
            'admin' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8.6 7 10 4.1-1.4 7-5.4 7-10V6l-7-3Z"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>',
        ];

        return $icons[$name] ?? '';
    }
}

$assetVersion = (string) max(
    @filemtime(PUBLICROOT . '/assets/app.css') ?: 0,
    @filemtime(PUBLICROOT . '/assets/app.js') ?: 0
);
$logoVersion = (string) (@filemtime(PUBLICROOT . '/taverai-logo-four.png') ?: time());
$logoUrl = base_url('taverai-logo-four.png') . '?v=' . $logoVersion;
$icoUrl = base_url('favicon.ico') . '?v=' . (string) (@filemtime(PUBLICROOT . '/favicon.ico') ?: time());
$faviconUrl = base_url('favicon.png') . '?v=' . (string) (@filemtime(PUBLICROOT . '/favicon.png') ?: time());
$appleIconUrl = base_url('apple-touch-icon.png') . '?v=' . (string) (@filemtime(PUBLICROOT . '/apple-touch-icon.png') ?: time());
$manifestUrl = base_url('manifest.webmanifest') . '?v=' . (string) (@filemtime(PUBLICROOT . '/manifest.webmanifest') ?: time());
$serviceWorkerVersion = (string) (@filemtime(PUBLICROOT . '/service-worker.js') ?: time());
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title><?= e($title ?? 'Taverai') ?></title>
    <style>
        html,
        body {
            background: #070d16;
        }
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="icon" type="image/png" sizes="64x64" href="<?= e($faviconUrl) ?>">
    <link rel="shortcut icon" type="image/x-icon" href="<?= e($icoUrl) ?>">
    <link rel="apple-touch-icon" sizes="180x180" href="<?= e($appleIconUrl) ?>">
    <link rel="manifest" href="<?= e($manifestUrl) ?>">
    <meta name="theme-color" content="#070d16">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="Taverai">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= e(base_url('assets/app.css') . '?v=' . $assetVersion) ?>">
</head>
<body data-page="<?= e($page ?? 'login') ?>" data-authenticated="<?= !empty($isAuthenticated) ? '1' : '0' ?>">
    <div class="offline-banner" id="offline-banner" role="status" aria-live="polite">You are offline. Viewing is limited until the connection returns.</div>
    <div class="app-loading-bar" id="app-loading-bar" aria-hidden="true"></div>
    <div class="install-banner" id="install-banner" role="region" aria-label="Install Taverai">
        <div>
            <strong>Install Taverai</strong>
            <p id="install-banner-copy">Add Taverai to your home screen for a faster app-like experience.</p>
        </div>
        <div class="install-banner-actions">
            <button class="button button-primary" id="install-app-button" type="button">Install</button>
            <button class="button button-soft" id="install-dismiss-button" type="button" aria-label="Dismiss install prompt">Dismiss</button>
        </div>
    </div>
    <div class="app-shell">
        <header class="app-topbar">
            <a class="brand" href="<?= e(route_url('log')) ?>" aria-label="Taverai home">
                <span class="brand-mark" aria-hidden="true"><img src="<?= e($logoUrl) ?>" alt=""></span>
                <span>
                    <strong>Taverai</strong>
                    <small>Track &bull; Score &bull; Improve</small>
                </span>
            </a>

            <nav class="app-nav" aria-label="Primary navigation">
                <a href="<?= e(route_url('log')) ?>" data-nav-link="log"><span class="nav-icon"><?= taverai_nav_icon('log') ?></span>Log</a>
                <a href="<?= e(route_url('coach')) ?>" data-nav-link="coach"><span class="nav-icon"><?= taverai_nav_icon('coach') ?></span>Coach</a>
                <a href="<?= e(route_url('menu')) ?>" data-nav-link="menu"><span class="nav-icon"><?= taverai_nav_icon('menu') ?></span>Menu</a>
                <a href="<?= e(route_url('plans')) ?>" data-nav-link="plans"><span class="nav-icon"><?= taverai_nav_icon('plans') ?></span>Plans</a>
                <a href="<?= e(route_url('account')) ?>" data-nav-link="account"><span class="nav-icon"><?= taverai_nav_icon('account') ?></span>You</a>
                <?php if (!empty($isAdmin)): ?>
                    <a href="<?= e(route_url('admin')) ?>" data-nav-link="admin"><span class="nav-icon"><?= taverai_nav_icon('admin') ?></span>Admin</a>
                <?php endif; ?>
                <a href="<?= e(route_url('login')) ?>" data-nav-link="login">Log in</a>
                <a href="<?= e(route_url('signup')) ?>" data-nav-link="signup">Sign up</a>
                <a href="<?= e(route_url('forgot')) ?>" data-nav-link="forgot">Reset</a>
            </nav>
        </header>

        <main class="app-main" id="main-content">
            <header class="page-hero">
                <h1><?= e($heading ?? 'Taverai') ?></h1>
                <p><?= e($subheading ?? '') ?></p>
            </header>

            <section class="page-card">
                <?php require APPROOT . '/views/partials/' . ($page ?? 'login') . '.php'; ?>
            </section>
        </main>

        <footer class="app-footer">
            <a class="brand" href="<?= e(route_url('log')) ?>" aria-label="Taverai home">
                <span class="brand-mark" aria-hidden="true"><img src="<?= e($logoUrl) ?>" alt=""></span>
                <span>
                    <strong>Taverai</strong>
                    <small>Track &bull; Score &bull; Improve</small>
                </span>
            </a>
            <nav class="footer-nav" aria-label="Footer navigation">
                <a href="<?= e(route_url('log')) ?>" data-nav-link="log"><span class="nav-icon"><?= taverai_nav_icon('log') ?></span>Log</a>
                <a href="<?= e(route_url('coach')) ?>" data-nav-link="coach"><span class="nav-icon"><?= taverai_nav_icon('coach') ?></span>Coach</a>
                <a href="<?= e(route_url('menu')) ?>" data-nav-link="menu"><span class="nav-icon"><?= taverai_nav_icon('menu') ?></span>Menu</a>
                <a href="<?= e(route_url('plans')) ?>" data-nav-link="plans"><span class="nav-icon"><?= taverai_nav_icon('plans') ?></span>Plans</a>
                <a href="<?= e(route_url('account')) ?>" data-nav-link="account"><span class="nav-icon"><?= taverai_nav_icon('account') ?></span>You</a>
                <?php if (!empty($isAdmin)): ?>
                    <a href="<?= e(route_url('admin')) ?>" data-nav-link="admin"><span class="nav-icon"><?= taverai_nav_icon('admin') ?></span>Admin</a>
                <?php endif; ?>
            </nav>
        </footer>
    </div>

    <nav class="bottom-nav">
        <a href="<?= e(route_url('log')) ?>" data-nav-link="log"><span class="nav-icon"><?= taverai_nav_icon('log') ?></span>Log</a>
        <a href="<?= e(route_url('coach')) ?>" data-nav-link="coach"><span class="nav-icon"><?= taverai_nav_icon('coach') ?></span>Coach</a>
        <a href="<?= e(route_url('menu')) ?>" data-nav-link="menu"><span class="nav-icon"><?= taverai_nav_icon('menu') ?></span>Menu</a>
        <a href="<?= e(route_url('plans')) ?>" data-nav-link="plans"><span class="nav-icon"><?= taverai_nav_icon('plans') ?></span>Plans</a>
        <a href="<?= e(route_url('account')) ?>" data-nav-link="account"><span class="nav-icon"><?= taverai_nav_icon('account') ?></span>You</a>
        <a href="<?= e(route_url('login')) ?>" data-nav-link="login">Login</a>
        <a href="<?= e(route_url('signup')) ?>" data-nav-link="signup">Signup</a>
    </nav>

    <script>
        window.TAVERI_APP = {
            publicBaseUrl: <?= json_encode(rtrim(base_url(), '/'), JSON_UNESCAPED_SLASHES) ?>,
            routePrefix: <?= json_encode(route_url(''), JSON_UNESCAPED_SLASHES) ?>,
            page: <?= json_encode($page ?? 'login', JSON_UNESCAPED_SLASHES) ?>,
            isAuthenticated: <?= !empty($isAuthenticated) ? 'true' : 'false' ?>,
            csrfToken: <?= json_encode(csrf_token(), JSON_UNESCAPED_SLASHES) ?>,
            serviceWorkerVersion: <?= json_encode($serviceWorkerVersion, JSON_UNESCAPED_SLASHES) ?>,
        };
    </script>
    <script src="<?= e(base_url('assets/app.js') . '?v=' . $assetVersion) ?>"></script>
</body>
</html>
