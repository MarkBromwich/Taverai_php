<?php

$router->get('/', 'HomeController@index');
$router->get('/health', 'HealthController@show');
$router->get('/login', 'HomeController@login');
$router->get('/signup', 'HomeController@signup');
$router->get('/forgot', 'HomeController@forgot');
$router->get('/reset', 'HomeController@reset');
$router->get('/log', 'HomeController@log');
$router->get('/menu', 'HomeController@menu');
$router->get('/favorites', 'HomeController@favorites');
$router->get('/plans', 'HomeController@plans');
$router->get('/account', 'HomeController@account');
$router->get('/coach', 'HomeController@coach');
$router->get('/admin', 'HomeController@admin');

$router->post('/api/signup', 'AuthController@signup');
$router->post('/api/login', 'AuthController@login');
$router->post('/api/logout', 'AuthController@logout');

$router->get('/api/me', 'AccountController@show');
$router->put('/api/me', 'AccountController@update');
$router->patch('/api/me', 'AccountController@update');
$router->get('/api/account/summary', 'AccountController@summary');
$router->get('/api/account/export', 'AccountController@export');
$router->get('/api/account/export/food-log', 'AccountController@exportFoodLog');
$router->post('/api/account/import', 'AccountController@import');
$router->post('/api/account/avatar', 'AccountController@avatar');
$router->delete('/api/account', 'AccountController@destroyAccount');

$router->get('/api/plan-templates', 'PlansController@templates');
$router->post('/api/plans/suggest', 'PlansController@suggest');
$router->get('/api/plans', 'PlansController@index');
$router->post('/api/plans', 'PlansController@store');
$router->delete('/api/plans', 'PlansController@destroy');

$router->get('/api/entries', 'EntriesController@index');
$router->get('/api/entries/summary', 'EntriesController@summary');
$router->post('/api/entries', 'EntriesController@store');
$router->patch('/api/entries', 'EntriesController@update');
$router->delete('/api/entries', 'EntriesController@destroy');

$router->post('/api/coach', 'CoachController@ask');
$router->get('/api/coach/summary', 'CoachController@summary');
$router->post('/api/meal-photo', 'MealPhotoController@store');
$router->post('/api/password/request', 'PasswordController@requestReset');
$router->post('/api/password/reset', 'PasswordController@reset');
$router->post('/api/ai/parse', 'AIController@parseText');
$router->post('/api/meal/scan', 'AIController@scanMealImage');
$router->post('/api/menu/analyze', 'MenuController@analyze');
$router->post('/api/menu/plan', 'MenuController@plan');
$router->get('/api/menu/favorites', 'MenuController@favorites');
$router->post('/api/menu/favorites', 'MenuController@saveFavorite');
$router->delete('/api/menu/favorites', 'MenuController@deleteFavorite');
$router->post('/api/nutrition/barcode', 'MenuController@barcode');
$router->get('/api/subscription', 'SubscriptionController@show');
$router->post('/api/subscription/apple/notifications', 'SubscriptionController@appleNotification');
$router->get('/api/admin/summary', 'AdminController@summary');
$router->get('/api/admin/logs', 'AdminController@logs');
$router->get('/api/admin/users', 'AdminController@users');
$router->patch('/api/admin/users', 'AdminController@updateUser');
$router->delete('/api/admin/users', 'AdminController@deleteUser');
$router->post('/api/admin/users/reset-link', 'AdminController@resetLink');
$router->patch('/api/admin/subscriptions', 'AdminController@updateSubscription');
$router->get('/api/admin/audit/meals', 'AdminController@mealAudit');
$router->delete('/api/admin/audit/meals', 'AdminController@deleteMeal');
