import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    const login = async (newToken, userData) => {
        setToken(newToken);
        setUser(userData);
        axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    };

    const logout = async () => {
        try {
            await axios.post("/api/auth/logout");
            setUser(null);
            setToken(null);
            delete axios.defaults.headers.common["Authorization"];
        } catch (err) {
            console.error("Logout error:", err);
        }
    };

    // 🔥 Added to support automatic SSO checks
    const restoreSession = async (ssoVerifyFn) => {
        const { user, token } = await ssoVerifyFn();
        if (user && token) {
            await login(token, user);
            return { user, token };
        }
        return { user: null, token: null };
    };

    return (
        <AuthContext.Provider value={{ 
            user, setUser, 
            token, setToken, 
            isAuthenticated: !!user, // 🔥 Boolean state
            loading, setLoading, 
            login, logout,
            restoreSession // 🔥 Restore logic
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
