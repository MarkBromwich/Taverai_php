<?php

class SmtpMailer
{
    private string $host;
    private int $port;
    private string $encryption;
    private string $username;
    private string $password;
    private string $fromEmail;
    private string $fromName;
    private bool $verifyPeer;
    /** @var resource|null */
    private $socket = null;

    public function __construct(array $config)
    {
        $this->host = (string) ($config['host'] ?? '');
        $this->port = (int) ($config['port'] ?? 587);
        $this->encryption = strtolower((string) ($config['encryption'] ?? 'tls'));
        $this->username = (string) ($config['username'] ?? '');
        $this->password = (string) ($config['password'] ?? '');
        $this->fromEmail = (string) ($config['from_email'] ?? $this->username);
        $this->fromName = (string) ($config['from_name'] ?? APP_NAME);
        $this->verifyPeer = (bool) ($config['verify_peer'] ?? true);
    }

    public function send(string $toEmail, string $subject, string $body): void
    {
        if ($this->host === '' || $this->username === '' || $this->password === '' || $this->fromEmail === '') {
            throw new RuntimeException('SMTP mail is not fully configured.');
        }

        $this->connect();

        try {
            $this->command('EHLO ' . $this->hostname(), [250]);

            if ($this->encryption === 'tls') {
                $this->command('STARTTLS', [220]);
                if (!stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new RuntimeException('SMTP STARTTLS negotiation failed.');
                }
                $this->command('EHLO ' . $this->hostname(), [250]);
            }

            $this->command('AUTH LOGIN', [334]);
            $this->command(base64_encode($this->username), [334]);
            $this->command(base64_encode($this->password), [235]);
            $this->command('MAIL FROM:<' . $this->fromEmail . '>', [250]);
            $this->command('RCPT TO:<' . $toEmail . '>', [250, 251]);
            $this->command('DATA', [354]);

            $message = $this->buildMessage($toEmail, $subject, $body);
            fwrite($this->socket, $message . "\r\n.\r\n");
            $this->expect([250]);
            $this->command('QUIT', [221]);
        } finally {
            if (is_resource($this->socket)) {
                fclose($this->socket);
            }
            $this->socket = null;
        }
    }

    private function connect(): void
    {
        $target = ($this->encryption === 'ssl' ? 'ssl://' : '') . $this->host . ':' . $this->port;
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => $this->verifyPeer,
                'verify_peer_name' => $this->verifyPeer,
                'allow_self_signed' => !$this->verifyPeer,
                'peer_name' => $this->host,
            ],
        ]);

        $this->socket = @stream_socket_client($target, $errno, $error, 20, STREAM_CLIENT_CONNECT, $context);

        if (!is_resource($this->socket)) {
            throw new RuntimeException('SMTP connection failed: ' . ($error ?: 'unknown error'));
        }

        stream_set_timeout($this->socket, 20);
        $this->expect([220]);
    }

    private function buildMessage(string $toEmail, string $subject, string $body): string
    {
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $this->formatAddress($this->fromEmail, $this->fromName),
            'To: <' . $toEmail . '>',
            'Subject: ' . $subject,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $this->hostname() . '>',
        ];

        $normalizedBody = str_replace(["\r\n", "\r"], "\n", $body);
        $normalizedBody = preg_replace('/^\./m', '..', $normalizedBody) ?? $normalizedBody;

        return implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $normalizedBody);
    }

    private function formatAddress(string $email, string $name): string
    {
        $safeName = trim(str_replace(['"', "\r", "\n"], ['', ' ', ' '], $name));
        if ($safeName === '') {
            return '<' . $email . '>';
        }

        return '"' . $safeName . '" <' . $email . '>';
    }

    private function command(string $command, array $expectedCodes): string
    {
        fwrite($this->socket, $command . "\r\n");
        return $this->expect($expectedCodes);
    }

    private function expect(array $expectedCodes): string
    {
        $response = '';
        while (($line = fgets($this->socket, 515)) !== false) {
            $response .= $line;
            if (strlen($line) >= 4 && $line[3] === ' ') {
                break;
            }
        }

        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $expectedCodes, true)) {
            throw new RuntimeException('SMTP server returned unexpected response: ' . trim($response));
        }

        return $response;
    }

    private function hostname(): string
    {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        return preg_replace('/[^a-z0-9.-]/i', '', $host) ?: 'localhost';
    }
}
