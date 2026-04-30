# GT_ONE Product Connector

Prefer the shared package:

- `D:\GT_ONE\GT_ONE\packages\gtone-product-connector`

Use no-code OpenID Connect first when the product supports generic OIDC/OAuth login. Use the shared package only for first-party products that do not have built-in OIDC support. Keep the example files in this folder only as reference for custom edge cases.

## Best Connection Choice

### 1. No-code OIDC setup

Use this when the product has an admin setting for OpenID Connect, OAuth2, or external identity provider login.

Configure the product with:

- Discovery URL: `https://your-gt-one-host/.well-known/openid-configuration`
- Authorization endpoint: `https://your-gt-one-host/api/sso/authorize`
- Token endpoint: `https://your-gt-one-host/api/sso/token`
- Userinfo endpoint: `https://your-gt-one-host/api/sso/userinfo`
- JWKS URL: `https://your-gt-one-host/.well-known/jwks.json`
- Client ID: the GT_ONE application key, for example `crm`
- Client secret: rotate once from GT_ONE Applications
- Scope: `openid profile email`
- Redirect URI: the callback URL from the product's OIDC settings

This requires no product code. It only requires product-side configuration.

### 2. Shared connector package

Use this when the product is your own Node/Express app and it does not support OIDC configuration. The product still needs one thin adapter for local session creation, but it should not reimplement SSO protocol logic.

## Flow

1. Product login button redirects browser to GT_ONE `/api/sso/authorize`
2. Product backend generates and stores a `state` value before redirecting
3. GT_ONE authenticates the user and redirects back to product callback with `code` and `state`
4. Product backend validates the returned `state`
5. Product backend exchanges `code` with GT_ONE `/api/sso/exchange` and sends its GT_ONE client secret
6. Product backend verifies the returned app token
7. Product backend creates or updates:
   - local user row
   - GT_ONE identity link row
8. Product backend creates its own local session cookie

## Recommended Local Tables

### 1. Local user table

Store product-specific data such as:

- `email`
- `name`
- `role`
- `companyId`
- `tenantId`
- product-specific permissions

### 2. GT_ONE identity link table

Store the link between GT_ONE and the local user:

- `appKey`
- `gtOneUserId`
- `gtOneCompanyId`
- `localUserId`
- `email`
- `lastLoginAt`
- `claimsSnapshot`

## Shared Package Flow

For new products, the minimum backend work is:

1. Register the product in GT_ONE
2. Rotate the GT_ONE client secret
3. Add `GTONE_*` env values in the product backend
4. Create one `GtOneIdentityLink` model
5. Mount one thin adapter route using `@gitakshmi/gtone-product-connector`

That removes the need to re-implement:

- state generation
- state validation
- code exchange
- JWKS verification
- identity-link sync
- GT_ONE global logout URL handling

## Legacy Reference Files

- `gtOneProductConnector.example.js`
- `GtOneIdentityLink.example.js`
- `productSso.routes.example.js`

## Important

Product apps should never validate the GT_ONE password themselves.

Product apps should only:

- exchange the authorization code
- send the GT_ONE client secret from backend env during exchange
- trust the GT_ONE token
- sync the local user
- create the local product session
