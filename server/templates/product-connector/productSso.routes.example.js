import crypto from "crypto";
import express from "express";
import {
  exchangeGtOneAuthorizationCode,
  syncLocalUserFromGtOneClaims,
  verifyGtOneProductToken
} from "./gtOneProductConnector.example.js";
import GtOneIdentityLink from "./GtOneIdentityLink.example.js";
import User from "../../models/User.js";

const router = express.Router();

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const buildAuthorizeUrl = ({ state }) => {
  const gtOneApiBaseUrl = trimTrailingSlash(process.env.GTONE_API_BASE_URL);
  const redirectUri = String(process.env.GTONE_REDIRECT_URI || "").trim();
  const appKey = String(process.env.GTONE_APP_KEY || "").trim();

  const params = new URLSearchParams({
    app: appKey,
    redirect_uri: redirectUri,
    state
  });

  return `${gtOneApiBaseUrl}/sso/authorize?${params.toString()}`;
};

router.get("/auth/sso/start", (req, res) => {
  const state = crypto.randomBytes(24).toString("base64url");
  req.session = req.session || {};
  req.session.gtOneSsoState = state;
  return res.redirect(buildAuthorizeUrl({ state }));
});

router.get("/auth/sso/callback", async (req, res, next) => {
  try {
    const code = String(req.query?.code || "").trim();
    const state = String(req.query?.state || "").trim();
    const expectedState = String(req.session?.gtOneSsoState || "").trim();

    if (!code || !state) {
      return res.status(400).json({ message: "Missing authorization code or state" });
    }

    if (!expectedState || expectedState !== state) {
      return res.status(400).json({ message: "Invalid SSO state" });
    }

    delete req.session.gtOneSsoState;

    const exchangeResult = await exchangeGtOneAuthorizationCode({
      gtOneApiBaseUrl: process.env.GTONE_API_BASE_URL,
      appKey: process.env.GTONE_APP_KEY,
      code,
      redirectUri: process.env.GTONE_REDIRECT_URI,
      clientSecret: process.env.GTONE_CLIENT_SECRET
    });

    const claims = verifyGtOneProductToken({
      token: exchangeResult.accessToken,
      jwtSecret: process.env.JWT_SECRET,
      audience: process.env.GTONE_TOKEN_AUDIENCE || process.env.GTONE_APP_KEY
    });

    const { localUser } = await syncLocalUserFromGtOneClaims({
      claims,
      appKey: process.env.GTONE_APP_KEY,
      localUserModel: User,
      identityLinkModel: GtOneIdentityLink
    });

    // Replace this with your real product session creation logic.
    req.session = req.session || {};
    req.session.userId = String(localUser._id);

    return res.redirect("/dashboard");
  } catch (error) {
    return next(error);
  }
});

export default router;
