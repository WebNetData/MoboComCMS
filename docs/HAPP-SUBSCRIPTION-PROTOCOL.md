# Official Happ integration

Source: https://www.happ.su/main/dev-docs/crypto-link

The server reads the public HTTPS subscription URL returned by the configured VPN panel (`panelSubUrl`) and sends `{ "url": "https://<panel>/..." }` to `https://crypto.happ.su/api-v2.php`. The service returns `encrypted_link` beginning with `happ://crypt5/`. Only this validated encrypted link is delivered through the dashboard, reseller API, Telegram, QR and REST API. The shop domain is not used as the source of newly issued subscription links, and raw VPN-panel URLs/profiles are not returned by customer-facing JSON endpoints.

The encryptor receives only the VPN panel subscription URL; config contents are not sent to it. The returned link is cached in server-side settings by SHA-256 of that panel URL. Panel URL/token rotation creates a different cache entry.

Happ decrypts the URL using its own implementation and requests the subscription directly from the VPN panel. MoboComCMS does not proxy newly issued subscription traffic through the shop domain. Hiding the raw panel URL from customer-facing MoboComCMS surfaces reduces accidental exposure, but absolute extraction resistance on a user-controlled device is not claimed.

Public HTTPS is required for the panel subscription URL. Localhost/private-style sources and the shop-domain mirror are rejected before calling the encryption service. If encryption fails, no raw panel link is substituted. Legacy mirror routes may remain only for compatibility with older installs; no newly issued customer link depends on them. Custom AES/RSA envelopes, `X-Happ-Client`, and `happ://subscription/import` are not used.

For device install limits or HWID binding, see https://docs.happ-proxy.com/getting-started/quickstart and https://docs.happ-proxy.com/getting-started/hwid-links. These need provider setup and are not implied by a crypt5 link alone.
