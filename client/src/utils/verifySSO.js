import axios from "axios";

// 🔥 GLOBAL AXIOS CONFIG FOR ALL CALLS
axios.defaults.withCredentials = true;

/**
 * verifySSO()
 * Checks if a session exists on the SSO server via cookie.
 * Returns { user, token } or { user: null }
 */
export const verifySSO = async () => {
    try {
        console.log("SSO: Verifying session...");
        
        // This will send the "token" cookie automatically
        const res = await axios.get("/api/auth/sso/me");

        console.log("SSO RESPONSE:", res.data);

        return {
            user: res.data.user || null,
            token: res.data.token || null
        };

    } catch (err) {
        console.error("SSO ERROR IN UTILS:", err.message);
        return { user: null, token: null };
    }
};
