import api from "../lib/api";

export const verifySSO = async () => {
  try {
    const res = await api.get("/auth/sso/me");
    return {
      user: res.data.user || null,
      token: res.data.token || null
    };
  } catch (_error) {
    return { user: null, token: null };
  }
};
