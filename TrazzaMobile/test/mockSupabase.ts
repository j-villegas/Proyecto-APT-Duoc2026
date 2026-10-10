import type { Session } from "@supabase/supabase-js";
import type { DbProfile } from "../src/types/database";

type Listener = (event: string, session: Session | null) => void;

interface FakeUser {
  id: string;
  email: string;
  password: string;
}

export const JUAN: FakeUser = {
  id: "f3b9f3b9-07d5-4c39-9fc4-ef2787d10435",
  email: "juan@trazza.cl",
  password: "NuevaClave123!",
};
export const CARLOS: FakeUser = {
  id: "e092c6c5-a600-4948-8f50-0b763e80ade9",
  email: "carlos@trazza.cl",
  password: "Conductor123!",
};

/** Fila de profiles tal como la devuelve la base del panel (con su conductor/pasajero vinculado). */
export function makeProfile(user: FakeUser, overrides: Partial<DbProfile> = {}): DbProfile {
  const isJuan = user.id === JUAN.id;
  return {
    id: user.id,
    company_id: "c0000000-0000-4000-8000-000000000001",
    full_name: isJuan ? "Juan Marchant" : "Carlos Mendoza",
    email: user.email,
    role: isJuan ? "passenger" : "driver",
    status: "active",
    phone: null,
    created_at: "2026-01-01T00:00:00Z",
    drivers: isJuan ? [] : [{ id: `driver-${user.id}`, deleted_at: null }],
    passengers: isJuan ? [{ id: `passenger-${user.id}`, deleted_at: null }] : [],
    ...overrides,
  };
}

export function makeSession(user: Pick<FakeUser, "id" | "email">): Session {
  return {
    access_token: `access-${user.id}`,
    refresh_token: `refresh-${user.id}`,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00Z",
    },
  } as Session;
}

/**
 * Cliente de Supabase en memoria: usuarios de Auth + tabla profiles.
 * Emite los mismos eventos de onAuthStateChange que el cliente real.
 */
export function createSupabaseMock({
  users = [JUAN, CARLOS],
  profiles = [makeProfile(JUAN), makeProfile(CARLOS)],
  initialSession = null as Session | null,
  /** Retraso (ms) al leer el perfil de un usuario, para simular respuestas fuera de orden. */
  profileDelayMs = {} as Record<string, number>,
} = {}) {
  const listeners: Listener[] = [];
  const profileTable = new Map(profiles.map((p) => [p.id, p]));
  let currentSession = initialSession;

  const emit = (event: string, session: Session | null) => {
    currentSession = session;
    listeners.forEach((listener) => listener(event, session));
  };

  const auth = {
    getSession: jest.fn(async () => ({ data: { session: currentSession }, error: null })),
    onAuthStateChange: jest.fn((listener: Listener) => {
      listeners.push(listener);
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    signInWithPassword: jest.fn(async ({ email, password }: { email: string; password: string }) => {
      const user = users.find((u) => u.email === email && u.password === password);
      if (!user) {
        return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
      }
      const session = makeSession(user);
      emit("SIGNED_IN", session);
      return { data: { user: session.user, session }, error: null };
    }),
    signOut: jest.fn(async () => {
      emit("SIGNED_OUT", null);
      return { error: null };
    }),
    resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
    updateUser: jest.fn(async () => ({ data: { user: currentSession?.user ?? null }, error: null })),
    setSession: jest.fn(async ({ access_token }: { access_token: string }) => {
      const user = users.find((u) => `access-${u.id}` === access_token);
      if (!user) return { data: { session: null }, error: { message: "Invalid token" } };
      const session = makeSession(user);
      emit("SIGNED_IN", session);
      return { data: { session }, error: null };
    }),
    exchangeCodeForSession: jest.fn(async () => ({ data: { session: null }, error: { message: "unused" } })),
  };

  const from = jest.fn((table: string) => {
    let id: string | null = null;
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => {
        id = value;
        return query;
      },
      maybeSingle: async () => {
        const delay = id ? profileDelayMs[id] ?? 0 : 0;
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return { data: table === "profiles" && id ? profileTable.get(id) ?? null : null, error: null };
      },
    };
    return query;
  });

  return { client: { auth, from }, emit, profileTable };
}
