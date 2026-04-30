# GT_ONE Product Connector

Reusable backend SSO connector for first-party Gitakshmi products.

## Goal

Move GT_ONE SSO protocol logic out of each product so new products only need:

1. GT_ONE application registration
2. GTONE_* env values
3. A thin local adapter for session creation

If a product already supports OpenID Connect/OAuth login in its admin settings, use that first. GT_ONE exposes standard discovery, authorization, token, userinfo, and JWKS endpoints so those products can be connected by configuration instead of code.

```env
OIDC_DISCOVERY_URL=https://your-gt-one-host/.well-known/openid-configuration
OIDC_CLIENT_ID=crm
OIDC_CLIENT_SECRET=copy_from_gtone
OIDC_SCOPES=openid profile email
```

## Product responsibilities

The product still owns:

- its own business data
- its own local user model
- its own local session cookie/token
- its own authorization rules

GT_ONE owns:

- identity
- login
- app access
- authorization code issuance
- signed app token issuance

## Minimal backend integration

1. Install the package in the product backend
2. Create one `GtOneIdentityLink` model
3. Mount one route file using `createGtOneSsoRouter(...)`
4. Provide:
   - local user lookup / optional JIT provisioning
   - local session creation
   - local logout cleanup

## Required env

```env
GTONE_API_BASE_URL=http://localhost:5004/api
GTONE_APP_KEY=crm
GTONE_REDIRECT_URI=http://localhost:5003/api/auth/sso/callback
GTONE_CLIENT_SECRET=copy_from_gtone
GTONE_JWKS_URL=http://localhost:5004/.well-known/jwks.json
GTONE_JWT_ISSUER=gtone-sso
GTONE_TOKEN_AUDIENCE=crm
```

## Default product routes

When mounted under `/api/auth`, the connector exposes:

- `GET /api/auth/sso/start`
- `GET /api/auth/sso/callback`
- `POST /api/auth/sso/logout`

## Frontend

If the product is opened from GT_ONE launcher, no product login UI change is required.

If the product has its own login page, add one button that points to:

```text
/api/auth/sso/start
```
