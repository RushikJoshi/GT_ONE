# GT_ONE SSO Restructure Plan

## Goal

Make GT_ONE the central identity and application hub so a new product can be added with a small standard integration instead of product-specific custom code.

Target outcome:

- Login once in GT_ONE
- Open any assigned product without logging in again
- Add a new product by registering it in GT_ONE and implementing one standard SSO contract in the product

## Current GT_ONE Behavior

### Current stack

- `client/`: React admin + login SPA
- `server/`: Express + MongoDB SSO server

### Current login flow

1. User logs in at GT_ONE with email/password.
2. Non-bypass users complete OTP.
3. Server builds one JWT containing:
   - identity
   - role
   - products
   - company/tenant context
   - HRMS module claims
4. Server returns `redirectTo`.
5. Frontend redirects the browser to the target product and appends `?token=...` in some cases.

### Current entitlement flow

- Products are resolved mainly from `Product` + `CompanyProduct`.
- Company creation and company product assignment are tied to HRMS provisioning.
- HRMS has special tenant and module logic inside the SSO service.
- CRM and PMS are treated as part of the TMS family in auth logic.

## Main Problems Found

### 1. Product onboarding is hard-coded

New products are not configuration-driven.

- Product names are fixed in `server/constants/products.js`
- `Product` schema only stores `name`
- Product URLs are hard-coded
- Redirect validation is limited to a fixed set of apps
- CORS/CSP defaults are tied to known domains
- Frontend allowed redirect origins are hard-coded

Result: adding a product requires server, client, and sometimes per-product changes.

### 2. Product model is inconsistent

There are two parallel ideas:

- `Product` / `CompanyProduct` used by the active auth flow
- `Application` / `allowedApps` code that looks like an app registry but is not wired into the running system

Result: the codebase has no single source of truth for "what is a product/app".

### 3. SSO exchange flow exists in service code but is not exposed

`auth.service.js` already contains building blocks for:

- app context resolution
- app token generation
- authorization code generation
- authorization code exchange

But there are no mounted routes/controllers using this flow today.

Result: the project still relies on redirecting with a shared token instead of a proper product handshake.

### 4. Auto-login across products is not standardized

Today the browser may be redirected with `token` in the query string.

That is fragile because:

- each product must know how to consume that token
- it mixes GT_ONE session and product session concerns
- it is harder to secure and rotate

### 5. Product-specific logic is mixed into GT_ONE core

Examples:

- HRMS provisioning is called from company creation and product assignment
- HRMS module settings are reused as pseudo-modules for CRM/PMS/DMS
- CRM/PMS map to TMS auth context instead of being first-class applications

Result: GT_ONE is tightly coupled to product internals.

### 6. Some important glue is incomplete

- Client expects `POST /api/auth/refresh`
- `auth.controller.js` implements `refresh`
- `auth.routes.js` does not mount it

Also:

- `app.routes.js` exists
- `server.js` does not mount it
- `allowedApps` is updated by controller code but is not defined in `User` or `Company` schemas

Result: there is dead or partially integrated architecture in the codebase.

## Recommended Target Architecture

GT_ONE should act as:

1. Identity Provider
2. Application Registry
3. Company entitlement manager
4. Product provisioning orchestrator
5. App launcher

## New Core Model

Replace the current hard-coded product model with a registry-driven model.

### `Application`

Stores product metadata.

Suggested fields:

- `key`: `hrms`, `crm`, `projects`, `vendor`, `dms`
- `name`
- `status`
- `baseUrl`
- `loginUrl`
- `logoutUrl`
- `redirectUris`
- `audience`
- `icon`
- `type`: `first_party` or `external`
- `supportsProvisioning`
- `provisioningAdapter`
- `defaultLandingPath`
- `claimMapping`

### `CompanyApplication`

Stores company-level entitlement and configuration.

Suggested fields:

- `companyId`
- `applicationId`
- `isActive`
- `plan`
- `limits`
- `settings`
- `provisioningState`
- `externalTenantId`
- `externalOrgId`

### Optional `UserApplicationAccess`

Only if per-user overrides are required.

Suggested use:

- allow a user into CRM but not PMS
- restrict elevated modules/features inside one app

## Standard SSO Contract For All Products

Every product should support the same GT_ONE flow.

### Preferred flow

Use GT_ONE as an internal OAuth-style authorization server.

#### Step 1

User opens product, for example CRM.

#### Step 2

If product has no local session, it redirects to GT_ONE:

`GET /api/sso/authorize?app=crm&redirect_uri=https://crm.example.com/auth/callback`

#### Step 3

If GT_ONE session already exists, GT_ONE does not ask for login again.

It creates a short-lived authorization code and redirects back:

`https://crm.example.com/auth/callback?code=...`

#### Step 4

Product backend exchanges the code with GT_ONE:

`POST /api/sso/exchange`

GT_ONE returns a product-scoped token or session payload.

#### Step 5

Product creates its own local session cookie.

Result:

- one GT_ONE session
- one clean handshake per product
- silent login when user is already authenticated in GT_ONE

## Why this is better than query-token redirect

- no long-lived token in URL
- app receives product-specific claims only
- easier revocation
- easier auditing
- easier onboarding for new products
- cleaner separation between GT_ONE session and product session

## What Each Product Must Implement

This should be the "one thing" you asked for.

Create one shared GT_ONE product integration package or template with:

1. `requireGtOneSession()` middleware
2. `/auth/start` route
3. `/auth/callback` route
4. backend code exchange helper
5. token/session validator
6. logout hook

Every new product should only need:

- product key
- GT_ONE URLs
- redirect URI
- claim mapping
- local user/session adapter

That becomes the reusable connector instead of writing custom code every time.

## GT_ONE API Surface To Add

### Session endpoints

- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### SSO endpoints

- `GET /api/sso/authorize`
- `POST /api/sso/exchange`
- `POST /api/sso/token/refresh` (optional)
- `POST /api/sso/logout-notify` (optional)

### App registry endpoints

- `GET /api/applications`
- `POST /api/applications`
- `PUT /api/applications/:id`
- `PATCH /api/applications/:id/status`

### Entitlement endpoints

- `GET /api/companies/:id/applications`
- `PUT /api/companies/:id/applications`
- `GET /api/users/:id/applications` (optional)

## Product Provisioning Design

Provisioning should be plugin-based, not hard-coded into auth logic.

Example adapters:

- `hrmsProvisioningAdapter`
- `crmProvisioningAdapter`
- `vendorProvisioningAdapter`

GT_ONE should call the adapter only when:

- a company gets the app
- app configuration changes
- re-sync is requested

Auth should read already-provisioned context, not run app-specific provisioning logic inline during every login unless recovery is explicitly needed.

## Recommended Restructure Phases

### Phase 1: Stabilize current system

- mount the missing `refresh` route
- remove or mark dead `app.routes` path
- choose one model: `Application` should replace `Product` long term
- stop relying on `allowedApps` until schema and runtime are aligned
- centralize app config in DB or env-backed registry

### Phase 2: Introduce app registry

- create `Application` and `CompanyApplication` as the canonical source
- migrate existing HRMS/TMS/CRM/PMS/PSA/DMS entries
- move URL, redirect URI, and audience config into the registry

### Phase 3: Ship GT_ONE authorize/exchange flow

- expose controller/routes for auth code generation and exchange
- issue short-lived authorization codes
- issue product-scoped access tokens
- validate exact redirect URI from registry

### Phase 4: Build product integration SDK

- backend middleware package
- frontend login bootstrap helper
- shared logout handling
- shared token claim validation

### Phase 5: Migrate existing apps

Order:

1. HRMS
2. TMS
3. CRM/PMS split into distinct app keys if they are truly separate products
4. PSA
5. DMS

### Phase 6: Build Zoho One style launcher

After GT_ONE session is established:

- show all assigned products
- show company/app status
- one-click open any assigned product
- no second login prompt

## Migration Rules

### Keep GT_ONE token generic

GT_ONE session token should identify the user and high-level entitlements.

Do not overload it with too much product-specific detail.

### Keep app token product-scoped

Each product should receive only the claims it needs.

### Separate identity from provisioning

- identity = who the user is
- entitlement = what apps they can open
- provisioning = tenant/workspace/org setup in that product

These should not be mixed into one giant login function.

## Practical First Implementation Choice

If you want the fastest path without rewriting everything at once:

1. Keep existing login + OTP endpoints
2. Add `Application` registry
3. Add `/api/sso/authorize` and `/api/sso/exchange`
4. Migrate HRMS and TMS to the new exchange flow
5. Remove query-string token bridging after both apps work

This gives you real SSO first, then you can simplify the rest.

## Biggest Decisions To Make Before Coding

1. Are CRM, PMS, TMS truly different products or one shared app with different modules?
2. Should every product keep its own local user table/session, or trust GT_ONE token only?
3. Should GT_ONE be purely internal SSO, or should it become a proper OIDC-compatible provider?
4. Should product provisioning happen synchronously on assignment, or asynchronously through jobs?

## Recommended Direction

For this codebase, the most practical direction is:

- GT_ONE as the central identity provider
- DB-driven application registry
- company-to-application entitlement table
- product-specific provisioning adapters
- authorization-code exchange for product login
- shared integration package for every product

That gives you the Zoho One style architecture you want without forcing hard-coded product logic into every new app.
