<?php

class OpenAIClient
{
    private string $apiKey;

    public function __construct(?string $apiKey = null)
    {
        $this->apiKey = trim((string) ($apiKey ?? config('openai.api_key', '')));
    }

    public function isConfigured(): bool
    {
        return $this->apiKey !== '';
    }

    public function responseText(string $model, string $instructions, string $input, int $maxTokens = 450): ?string
    {
        if (!$this->isConfigured()) {
            return null;
        }

        $payload = [
            'model' => $model,
            'instructions' => $instructions,
            'input' => $input,
            'max_output_tokens' => $maxTokens,
        ];

        $response = $this->postJson('https://api.openai.com/v1/responses', $payload);
        if (!is_array($response)) {
            return null;
        }

        $text = trim((string) ($response['output_text'] ?? ''));
        return $text !== '' ? $text : null;
    }

    public function responseJsonWithImage(string $model, string $instructions, string $prompt, string $mimeType, string $base64Data, int $maxTokens = 700): ?array
    {
        if (!$this->isConfigured()) {
            return null;
        }

        $payload = [
            'model' => $model,
            'instructions' => $instructions,
            'input' => [
                [
                    'role' => 'user',
                    'content' => [
                        [
                            'type' => 'input_text',
                            'text' => $prompt,
                        ],
                        [
                            'type' => 'input_image',
                            'image_url' => 'data:' . $mimeType . ';base64,' . $base64Data,
                        ],
                    ],
                ],
            ],
            'max_output_tokens' => $maxTokens,
        ];

        $response = $this->postJson('https://api.openai.com/v1/responses', $payload);
        if (!is_array($response)) {
            return null;
        }

        $text = $this->extractResponseText($response);
        if ($text === '') {
            return null;
        }

        $decoded = json_decode($this->cleanJsonText($text), true);
        return is_array($decoded) ? $decoded : null;
    }

    public function chatJsonWithImage(string $model, string $systemPrompt, string $userPrompt, string $mimeType, string $base64Data, int $maxTokens = 700): ?array
    {
        if (!$this->isConfigured()) {
            return null;
        }

        $payload = [
            'model' => $model,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                [
                    'role' => 'user',
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => $userPrompt,
                        ],
                        [
                            'type' => 'image_url',
                            'image_url' => [
                                'url' => 'data:' . $mimeType . ';base64,' . $base64Data,
                            ],
                        ],
                    ],
                ],
            ],
            'max_tokens' => $maxTokens,
        ];

        $response = $this->postJson('https://api.openai.com/v1/chat/completions', $payload);
        if (!is_array($response)) {
            return null;
        }

        $content = $response['choices'][0]['message']['content'] ?? null;
        if (!is_string($content) || trim($content) === '') {
            return null;
        }

        $decoded = json_decode($this->cleanJsonText($content), true);
        return is_array($decoded) ? $decoded : null;
    }

    public function chatJson(string $model, string $systemPrompt, string $userPrompt): ?array
    {
        if (!$this->isConfigured()) {
            return null;
        }

        $payload = [
            'model' => $model,
            'response_format' => ['type' => 'json_object'],
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt],
            ],
        ];

        $response = $this->postJson('https://api.openai.com/v1/chat/completions', $payload);
        if (!is_array($response)) {
            return null;
        }

        $content = $response['choices'][0]['message']['content'] ?? null;
        if (!is_string($content) || trim($content) === '') {
            return null;
        }

        $decoded = json_decode($content, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function postJson(string $url, array $payload): ?array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES),
            CURLOPT_TIMEOUT => 45,
        ]);

        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if (!is_string($raw) || $raw === '' || $status < 200 || $status >= 300) {
            app_log('OpenAI request failed', [
                'status' => $status,
                'error' => $error,
                'bodyPreview' => is_string($raw) ? substr($raw, 0, 240) : null,
            ]);
            return null;
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function extractResponseText(array $response): string
    {
        $direct = trim((string) ($response['output_text'] ?? ''));
        if ($direct !== '') {
            return $direct;
        }

        $chunks = [];
        foreach (($response['output'] ?? []) as $output) {
            if (!is_array($output)) {
                continue;
            }
            foreach (($output['content'] ?? []) as $content) {
                if (!is_array($content)) {
                    continue;
                }
                $text = $content['text'] ?? null;
                if (is_string($text) && trim($text) !== '') {
                    $chunks[] = trim($text);
                }
            }
        }

        return trim(implode("\n", $chunks));
    }

    private function cleanJsonText(string $text): string
    {
        $text = trim($text);
        if (preg_match('/^```(?:json)?\s*(.*?)\s*```$/is', $text, $matches)) {
            return trim($matches[1]);
        }

        return $text;
    }
}
