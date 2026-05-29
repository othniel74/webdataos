# API Key Authentication

The API supports two auth headers:

```http
X-API-Key: <key>
```

or

```http
Authorization: Bearer <key>
```

Local demo mode can run with `API_AUTH_ENABLED=false`. For any shared environment, set:

```env
API_AUTH_ENABLED=true
API_KEYS=key-one,key-two
```

SDKs automatically send the key when `WEB_DATA_GATEWAY_API_KEY` is set.
