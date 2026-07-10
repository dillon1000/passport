# Machine-to-Machine Tokens

Passport issues machine-to-machine tokens through the OAuth `client_credentials` grant. Use this for backends, scheduled jobs, deploy hooks, and other callers that act as the application itself rather than as a signed-in user.

## Configure APIs

Define protected APIs with `OAUTH_RESOURCES`:

```env
OAUTH_RESOURCES=[{"identifier":"https://api.example.com","name":"Example API","scopes":["permissions"]}]
```

`identifier` is the OAuth resource/audience value the client sends as `resource`. `scopes` must already exist in Passport's central OAuth scope registry.

## Register A Client

In `/applications`, choose `M2M`, enter allowed audiences, and select scopes for the client. Passport stores these as `grantTypes: ["client_credentials"]` and client metadata. M2M clients are always confidential and have no redirect URIs.

For static config, include the same fields in `OAUTH_CLIENTS` when you need a bootstrap client:

```json
{
	"id": "worker-job",
	"secret": "replace-with-secret",
	"name": "Worker Job",
	"redirectUris": [],
	"scopes": ["permissions"],
	"grantTypes": ["client_credentials"],
	"allowedAudiences": ["https://api.example.com"]
}
```

## Request A Token

```bash
curl -u "client_id:client_secret" \
	-d grant_type=client_credentials \
	-d resource=https://api.example.com \
	-d scope=permissions \
	https://passport.example.com/api/auth/oauth2/token
```

Passport requires `resource` for `client_credentials`, checks that the client is allowed to use that audience, and checks the requested scopes against the configured API resource. The resulting JWT access token has `aud` set to the requested resource and `azp` set to the client ID.

Resource servers should validate these tokens with the recipes in [token validation](./token-validation.md).
