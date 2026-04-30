import jwt from "jsonwebtoken";

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

export const exchangeGtOneAuthorizationCode = async ({
  gtOneApiBaseUrl,
  appKey,
  code,
  redirectUri,
  clientSecret
}) => {
  const baseUrl = trimTrailingSlash(gtOneApiBaseUrl);
  const response = await fetch(`${baseUrl}/sso/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app: appKey,
      code,
      redirectUri,
      clientSecret
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "GT_ONE exchange failed");
  }

  return data;
};

export const verifyGtOneProductToken = ({
  token,
  jwtSecret,
  audience,
  issuer = "gtone-sso"
}) => {
  return jwt.verify(token, jwtSecret, {
    issuer,
    audience
  });
};

export const syncLocalUserFromGtOneClaims = async ({
  claims,
  appKey,
  localUserModel,
  identityLinkModel,
  createLocalUserPayload = (nextClaims) => ({
    email: nextClaims.email,
    name: nextClaims.name,
    role: nextClaims.role,
    companyId: nextClaims.companyId || null,
    tenantId: nextClaims.tenantId || null
  }),
  updateLocalUserPayload = (nextClaims, existingUser) => ({
    ...existingUser.toObject(),
    email: nextClaims.email,
    name: nextClaims.name,
    role: nextClaims.role,
    companyId: nextClaims.companyId || existingUser.companyId || null,
    tenantId: nextClaims.tenantId || existingUser.tenantId || null
  })
}) => {
  const gtOneUserId = String(claims?.sub || "").trim();
  const email = String(claims?.email || "").trim().toLowerCase();

  if (!gtOneUserId || !email) {
    throw new Error("Missing GT_ONE identity claims");
  }

  let identityLink = await identityLinkModel.findOne({
    appKey,
    gtOneUserId
  });

  let localUser = null;
  if (identityLink?.localUserId) {
    localUser = await localUserModel.findById(identityLink.localUserId);
  }

  if (!localUser) {
    localUser = await localUserModel.findOne({ email });
  }

  let created = false;
  if (!localUser) {
    localUser = await localUserModel.create(createLocalUserPayload(claims));
    created = true;
  } else {
    Object.assign(localUser, updateLocalUserPayload(claims, localUser));
    await localUser.save();
  }

  identityLink = await identityLinkModel.findOneAndUpdate(
    {
      appKey,
      gtOneUserId
    },
    {
      appKey,
      gtOneUserId,
      gtOneCompanyId: claims.companyId || null,
      localUserId: localUser._id,
      email,
      lastLoginAt: new Date(),
      claimsSnapshot: claims
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  return {
    localUser,
    identityLink,
    created
  };
};
