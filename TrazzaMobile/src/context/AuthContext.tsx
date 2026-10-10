import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Linking from "expo-linking";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getPasswordResetRedirectUrl, parseAuthRedirect } from "../lib/authLinks";
import { mapProfile } from "../services/mappers";
import type { DbProfile, Profile } from "../types/database";

type Result = { error: string | null };

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Error al cargar el perfil del usuario autenticado (ej: no existe fila en profiles). */
  profileError: string | null;
  /** true mientras el usuario viene de un enlace de recuperación y debe definir su nueva contraseña. */
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<Result>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<Result>;
  updatePassword: (password: string) => Promise<Result>;
  finishPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  // Usuario cuyo perfil debe estar cargado; descarta respuestas que llegan tarde de otro usuario.
  const currentUserId = useRef<string | null>(null);

  const loadProfile = async (userId: string) => {
    currentUserId.current = userId;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, company_id, full_name, email, phone, role, status, created_at, drivers(id, deleted_at), passengers(id, deleted_at)"
      )
      .eq("id", userId)
      .maybeSingle();

    if (currentUserId.current !== userId) return;
    const row = data as DbProfile | null;
    const mapped = row ? mapProfile(row) : null;
    if (error) {
      console.warn("[auth] error al cargar el perfil", error.message);
      setProfileError("No pudimos cargar tu perfil. Intenta de nuevo.");
      setProfile(null);
    } else if (!row || row.id !== userId) {
      setProfileError("Tu cuenta no tiene un perfil asignado. Contacta al administrador.");
      setProfile(null);
    } else if (row.status !== "active") {
      setProfileError("Tu cuenta está desactivada. Contacta al administrador.");
      setProfile(null);
    } else if (!mapped) {
      setProfileError("Esta app es para conductores y pasajeros. Usa el panel web de administración.");
      setProfile(null);
    } else if (!mapped.driver_id && !mapped.passenger_id) {
      setProfileError(
        mapped.role === "conductor"
          ? "Tu cuenta no está vinculada a un conductor del panel. Contacta al administrador."
          : "Tu cuenta no está vinculada a un pasajero del panel. Contacta al administrador."
      );
      setProfile(null);
    } else {
      setProfileError(null);
      setProfile(mapped);
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(nextSession);
      if (nextSession?.user) {
        const userId = nextSession.user.id;
        if (currentUserId.current !== userId) setProfile(null);
        // No hacer await de llamadas a Supabase dentro del callback (puede bloquear el cliente).
        setTimeout(() => {
          if (mounted) loadProfile(userId);
        }, 0);
      } else {
        currentUserId.current = null;
        setProfile(null);
        setPasswordRecovery(false);
      }
    });

    // Enlaces de correo (recuperación de contraseña) que abren la app: trazza://reset-password#...
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const redirect = parseAuthRedirect(url);
      if (!redirect) return;

      if (redirect.type === "error") {
        Alert.alert("Enlace no válido", "El enlace expiró o ya fue usado. Solicita uno nuevo.");
        return;
      }

      if (redirect.isRecovery) setPasswordRecovery(true);
      const { error } =
        redirect.type === "tokens"
          ? await supabase.auth.setSession({
              access_token: redirect.accessToken,
              refresh_token: redirect.refreshToken,
            })
          : await supabase.auth.exchangeCodeForSession(redirect.code);

      if (error && mounted) {
        setPasswordRecovery(false);
        Alert.alert("Enlace no válido", "El enlace expiró o ya fue usado. Solicita uno nuevo.");
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const linkSubscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    setProfileError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) return { error: error.message };

    // Defensa extra: la sesión debe pertenecer exactamente al correo ingresado.
    if (data.user?.email?.toLowerCase() !== normalizedEmail) {
      await signOut();
      return { error: "La sesión no coincide con el correo ingresado." };
    }
    return { error: null };
  };

  const signOut = async () => {
    currentUserId.current = null;
    setProfile(null);
    setPasswordRecovery(false);
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await loadProfile(session.user.id);
    }
  };

  const requestPasswordReset: AuthContextValue["requestPasswordReset"] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    return { error: error?.message ?? null };
  };

  const updatePassword: AuthContextValue["updatePassword"] = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const finishPasswordRecovery = () => setPasswordRecovery(false);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      profileError,
      passwordRecovery,
      signIn,
      signOut,
      refreshProfile,
      requestPasswordReset,
      updatePassword,
      finishPasswordRecovery,
    }),
    [session, profile, loading, profileError, passwordRecovery]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
