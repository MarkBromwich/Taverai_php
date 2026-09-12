<?php

class SubscriptionController extends Controller
{
    public function show(): void
    {
        $userId = $this->requireUserId();
        $subscription = $this->model('SubscriptionModel')->currentForUser($userId);
        $this->json([
            'subscription' => $subscription ?: [
                'provider' => 'apple',
                'status' => 'inactive',
                'product_id' => null,
                'expires_at' => null,
            ],
        ]);
    }

    /**
     * Apple App Store Server Notifications V2 webhook.
     *
     * IMPORTANT: this verifies the notification is genuinely from Apple and
     * logs it, but does NOT yet update user_subscriptions/paid_status. There
     * is no in-app purchase flow wired up yet (no StoreKit product ids, no
     * appAccountToken linking a purchase to a Taverai user id), so there is
     * nothing reliable to map a verified notification onto. Wire that up
     * once the purchase flow exists - see SubscriptionModel::upsertManual
     * for the shape user_subscriptions expects.
     */
    public function appleNotification(): void
    {
        $body = $this->body();
        $signedPayload = (string) ($body['signedPayload'] ?? '');

        if ($signedPayload === '') {
            app_log('Apple subscription notification rejected: missing signedPayload', [
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
            $this->json(['error' => 'Missing signedPayload'], 400);
            return;
        }

        $verifier = new AppleNotificationVerifier();
        $payload = $verifier->verify($signedPayload);

        if ($payload === null) {
            app_log('Apple subscription notification rejected: signature verification failed', [
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
            $this->json(['error' => 'Invalid signature'], 400);
            return;
        }

        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
        $bundleId = (string) ($data['bundleId'] ?? '');
        $expectedBundleId = (string) config('subscriptions.bundle_id', 'com.taverai.app');

        if ($bundleId !== '' && $bundleId !== $expectedBundleId) {
            app_log('Apple subscription notification rejected: bundle id mismatch', [
                'bundleId' => $bundleId,
                'expected' => $expectedBundleId,
            ]);
            $this->json(['error' => 'Bundle id mismatch'], 400);
            return;
        }

        $transactionInfo = isset($data['signedTransactionInfo']) && is_string($data['signedTransactionInfo'])
            ? $verifier->verify($data['signedTransactionInfo'])
            : null;
        $renewalInfo = isset($data['signedRenewalInfo']) && is_string($data['signedRenewalInfo'])
            ? $verifier->verify($data['signedRenewalInfo'])
            : null;

        app_log('Apple subscription notification verified', [
            'notificationType' => $payload['notificationType'] ?? null,
            'subtype' => $payload['subtype'] ?? null,
            'environment' => $data['environment'] ?? null,
            'bundleId' => $bundleId ?: null,
            'originalTransactionId' => $transactionInfo['originalTransactionId'] ?? null,
            'productId' => $transactionInfo['productId'] ?? null,
            'expiresDate' => $transactionInfo['expiresDate'] ?? null,
            'autoRenewStatus' => $renewalInfo['autoRenewStatus'] ?? null,
        ]);

        $this->json(['ok' => true]);
    }
}
