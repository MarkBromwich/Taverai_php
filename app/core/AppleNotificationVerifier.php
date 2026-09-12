<?php

/**
 * Verifies the signed JWS payloads Apple sends via App Store Server
 * Notifications V2 (and the nested signedTransactionInfo/signedRenewalInfo
 * strings inside them), per Apple's documented verification procedure:
 * https://developer.apple.com/documentation/appstoreservernotifications/generating_json_web_signature_(jws)_objects
 *
 * This checks the x5c certificate chain in the JWS header terminates at
 * Apple's trusted root CA (bundled in certs/AppleRootCA-G3.pem) and that the
 * ES256 signature verifies against the chain's leaf certificate. It does not
 * check WHAT the payload says (product ids, user mapping, etc.) - callers
 * still need to decide what to trust the decoded payload to mean.
 */
class AppleNotificationVerifier
{
    private string $rootCaPath;

    public function __construct(?string $rootCaPath = null)
    {
        $this->rootCaPath = $rootCaPath ?? __DIR__ . '/certs/AppleRootCA-G3.pem';
    }

    /**
     * @return array<string, mixed>|null The decoded payload if the JWS is
     *     structurally valid, ES256-signed, and its x5c chain verifies back
     *     to Apple's root CA. Null on any failure.
     */
    public function verify(string $jws): ?array
    {
        $parts = explode('.', $jws);
        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        $header = json_decode($this->base64UrlDecode($headerB64), true);
        if (!is_array($header) || ($header['alg'] ?? null) !== 'ES256' || empty($header['x5c']) || !is_array($header['x5c'])) {
            return null;
        }

        $publicKey = $this->verifiedLeafPublicKey($header['x5c']);
        if ($publicKey === null) {
            return null;
        }

        $signature = $this->base64UrlDecode($signatureB64);
        $derSignature = $this->joseToDerSignature($signature);
        if ($derSignature === null) {
            return null;
        }

        $signingInput = $headerB64 . '.' . $payloadB64;
        $verified = openssl_verify($signingInput, $derSignature, $publicKey, OPENSSL_ALGO_SHA256);
        if ($verified !== 1) {
            return null;
        }

        $payload = json_decode($this->base64UrlDecode($payloadB64), true);
        return is_array($payload) ? $payload : null;
    }

    /**
     * @param mixed[] $x5c Base64 (not base64url) DER certificates, leaf first.
     */
    private function verifiedLeafPublicKey(array $x5c): mixed
    {
        if ($x5c === []) {
            return null;
        }

        $certs = [];
        foreach ($x5c as $entry) {
            if (!is_string($entry)) {
                return null;
            }

            $der = base64_decode($entry, true);
            if ($der === false) {
                return null;
            }

            $pem = "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END CERTIFICATE-----\n";
            $resource = openssl_x509_read($pem);
            if ($resource === false) {
                return null;
            }

            $certs[] = $resource;
        }

        $now = time();
        foreach ($certs as $cert) {
            $parsed = openssl_x509_parse($cert);
            if ($parsed === false || $now < $parsed['validFrom_time_t'] || $now > $parsed['validTo_time_t']) {
                return null;
            }
        }

        $rootPem = @file_get_contents($this->rootCaPath);
        if (!is_string($rootPem) || $rootPem === '') {
            return null;
        }

        $root = openssl_x509_read($rootPem);
        if ($root === false) {
            return null;
        }

        $chain = array_merge($certs, [$root]);
        for ($i = 0, $last = count($chain) - 1; $i < $last; $i++) {
            $issuerPublicKey = openssl_pkey_get_public($chain[$i + 1]);
            if ($issuerPublicKey === false || openssl_x509_verify($chain[$i], $issuerPublicKey) !== 1) {
                return null;
            }
        }

        $trustedRoot = end($chain);
        if (openssl_x509_fingerprint($trustedRoot, 'sha256') !== openssl_x509_fingerprint($root, 'sha256')) {
            return null;
        }

        return openssl_pkey_get_public($certs[0]);
    }

    private function joseToDerSignature(string $joseSignature): ?string
    {
        $length = strlen($joseSignature);
        if ($length === 0 || $length % 2 !== 0) {
            return null;
        }

        $half = intdiv($length, 2);
        $r = $this->derInteger($this->trimLeadingZeroes(substr($joseSignature, 0, $half)));
        $s = $this->derInteger($this->trimLeadingZeroes(substr($joseSignature, $half)));
        $sequenceBody = $r . $s;

        return "\x30" . $this->derLength(strlen($sequenceBody)) . $sequenceBody;
    }

    private function trimLeadingZeroes(string $bytes): string
    {
        $trimmed = ltrim($bytes, "\x00");
        return $trimmed === '' ? "\x00" : $trimmed;
    }

    private function derInteger(string $bytes): string
    {
        if ((ord($bytes[0]) & 0x80) !== 0) {
            $bytes = "\x00" . $bytes;
        }

        return "\x02" . $this->derLength(strlen($bytes)) . $bytes;
    }

    private function derLength(int $length): string
    {
        if ($length < 128) {
            return chr($length);
        }

        $bytes = ltrim(pack('N', $length), "\x00");
        return chr(0x80 | strlen($bytes)) . $bytes;
    }

    private function base64UrlDecode(string $value): string
    {
        $padded = strtr($value, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder !== 0) {
            $padded .= str_repeat('=', 4 - $remainder);
        }

        return (string) base64_decode($padded, true);
    }
}
