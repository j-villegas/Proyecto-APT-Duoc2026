import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Linking from "expo-linking";
import { AuthProvider } from "../context/AuthContext";
import { RootNavigator } from "../navigation/RootNavigator";
import {
  CARLOS,
  JUAN,
  createSupabaseMock,
  makeProfile,
  makeSession,
} from "../../test/mockSupabase";

let mockSupabase: ReturnType<typeof createSupabaseMock>;

jest.mock("../lib/supabase", () => ({
  get supabase() {
    return mockSupabase.client;
  },
}));

jest.mock("../services/services", () => ({
  getNextServiceForPassenger: jest.fn().mockResolvedValue(null),
  getPassengerHistory: jest.fn().mockResolvedValue([]),
  getDriverServices: jest.fn().mockResolvedValue([]),
  getVehicleById: jest.fn().mockResolvedValue(null),
  getServiceById: jest.fn().mockResolvedValue(null),
  getServiceStops: jest.fn().mockResolvedValue([]),
  updateServiceStatus: jest.fn(),
  updateStopStatus: jest.fn(),
}));

async function renderApp() {
  await render(
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
  await screen.findByText("Iniciar sesión");
}

async function login(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), email);
  await fireEvent.changeText(screen.getByLabelText("Contraseña"), password);
  await fireEvent.press(screen.getByText("Iniciar sesión"));
}

async function logoutFromProfileTab() {
  await fireEvent.press(screen.getByText("Perfil"));
  await fireEvent.press(await screen.findByText("Cerrar sesión"));
  await screen.findByText("Iniciar sesión");
}

beforeEach(() => {
  mockSupabase = createSupabaseMock();
  jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
});

describe("inicio de sesión", () => {
  it("juan@trazza.cl entra a la vista de pasajero con su propio perfil", async () => {
    await renderApp();
    await login(JUAN.email, JUAN.password);

    expect(await screen.findByText("Hola, Juan")).toBeTruthy();
    expect(screen.queryByText(/Carlos/)).toBeNull();

    await fireEvent.press(screen.getByText("Perfil"));
    expect(await screen.findByText("Juan Marchant")).toBeTruthy();
    expect(screen.getByText("Pasajero")).toBeTruthy();
    expect(screen.getByText(JUAN.email)).toBeTruthy();
  });

  it("carlos@trazza.cl entra a la vista de conductor", async () => {
    await renderApp();
    await login(CARLOS.email, CARLOS.password);

    expect(await screen.findByText("Hola, Carlos")).toBeTruthy();
    expect(screen.getByText("En ruta")).toBeTruthy();
  });

  it("normaliza mayúsculas y espacios del correo", async () => {
    await renderApp();
    await login("  Juan@Trazza.CL ", JUAN.password);

    expect(await screen.findByText("Hola, Juan")).toBeTruthy();
    expect(mockSupabase.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: JUAN.email,
      password: JUAN.password,
    });
  });

  it("al cambiar de cuenta no queda el perfil del usuario anterior", async () => {
    await renderApp();

    await login(CARLOS.email, CARLOS.password);
    await screen.findByText("Hola, Carlos");
    await logoutFromProfileTab();

    await login(JUAN.email, JUAN.password);
    expect(await screen.findByText("Hola, Juan")).toBeTruthy();
    expect(screen.queryByText("Hola, Carlos")).toBeNull();
  });

  it("con una sesión persistida de Carlos, entrar como Juan muestra a Juan aunque el perfil de Carlos responda tarde", async () => {
    mockSupabase = createSupabaseMock({
      initialSession: makeSession(CARLOS),
      profileDelayMs: { [CARLOS.id]: 50 },
    });
    await render(
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    );
    // Mientras el perfil de Carlos carga, llega el inicio de sesión de Juan.
    await act(async () => mockSupabase.emit("SIGNED_IN", makeSession(JUAN)));

    expect(await screen.findByText("Hola, Juan")).toBeTruthy();
    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));
    expect(screen.getByText("Hola, Juan")).toBeTruthy();
    expect(screen.queryByText("Hola, Carlos")).toBeNull();
  });

  it("muestra error con contraseña incorrecta y no entra", async () => {
    await renderApp();
    await login(JUAN.email, "mala");

    expect(
      await screen.findByText("Credenciales inválidas. Verifica tus datos e intenta de nuevo.")
    ).toBeTruthy();
    expect(screen.queryByText("Hola, Juan")).toBeNull();
  });

  it("avisa cuando la cuenta no tiene perfil en lugar de quedarse en blanco", async () => {
    mockSupabase = createSupabaseMock({ profiles: [makeProfile(CARLOS)] });
    await renderApp();
    await login(JUAN.email, JUAN.password);

    expect(
      await screen.findByText("Tu cuenta no tiene un perfil asignado. Contacta al administrador.")
    ).toBeTruthy();
    expect(screen.getByText("Iniciar sesión")).toBeTruthy();
  });

  it("no deja entrar a un administrador del panel", async () => {
    mockSupabase = createSupabaseMock({
      profiles: [makeProfile(JUAN, { role: "admin", passengers: [] }), makeProfile(CARLOS)],
    });
    await renderApp();
    await login(JUAN.email, JUAN.password);

    expect(
      await screen.findByText(
        "Esta app es para conductores y pasajeros. Usa el panel web de administración."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Hola, Juan")).toBeNull();
  });

  it("avisa cuando el conductor no está vinculado a un registro del panel", async () => {
    mockSupabase = createSupabaseMock({
      profiles: [makeProfile(JUAN), makeProfile(CARLOS, { drivers: [] })],
    });
    await renderApp();
    await login(CARLOS.email, CARLOS.password);

    expect(
      await screen.findByText(
        "Tu cuenta no está vinculada a un conductor del panel. Contacta al administrador."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Hola, Carlos")).toBeNull();
  });
});

describe("restablecer contraseña", () => {
  it("envía el correo de recuperación con el deep link de la app", async () => {
    await renderApp();
    await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), JUAN.email);
    await fireEvent.press(screen.getByText("¿Olvidaste tu contraseña?"));

    // El correo escrito en el login se precarga.
    await fireEvent.press(await screen.findByText("Enviar enlace"));

    expect(await screen.findByText("Revisa tu correo")).toBeTruthy();
    expect(mockSupabase.client.auth.resetPasswordForEmail).toHaveBeenCalledWith(JUAN.email, {
      redirectTo: "trazza://reset-password",
    });
  });

  it("valida el correo antes de enviar", async () => {
    await renderApp();
    await fireEvent.press(screen.getByText("¿Olvidaste tu contraseña?"));
    await fireEvent.changeText(await screen.findByLabelText("Correo electrónico"), "no-es-correo");
    await fireEvent.press(screen.getByText("Enviar enlace"));

    expect(await screen.findByText("Ingresa un correo electrónico válido.")).toBeTruthy();
    expect(mockSupabase.client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("el enlace del correo abre la pantalla de nueva contraseña y luego entra como Juan", async () => {
    jest
      .mocked(Linking.getInitialURL)
      .mockResolvedValue(
        `trazza://reset-password#access_token=access-${JUAN.id}&refresh_token=r&type=recovery`
      );
    await render(
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    );

    expect(await screen.findByText(`para ${JUAN.email}`)).toBeTruthy();
    expect(screen.getByText("Guardar contraseña")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Nueva contraseña"), "corta");
    await fireEvent.changeText(screen.getByLabelText("Confirmar contraseña"), "corta");
    await fireEvent.press(screen.getByText("Guardar contraseña"));
    expect(
      await screen.findByText("La contraseña debe tener al menos 8 caracteres.")
    ).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Nueva contraseña"), "OtraClave456!");
    await fireEvent.changeText(screen.getByLabelText("Confirmar contraseña"), "OtraClave457!");
    await fireEvent.press(screen.getByText("Guardar contraseña"));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Confirmar contraseña"), "OtraClave456!");
    await fireEvent.press(screen.getByText("Guardar contraseña"));

    expect(await screen.findByText("Hola, Juan")).toBeTruthy();
    expect(mockSupabase.client.auth.updateUser).toHaveBeenCalledWith({ password: "OtraClave456!" });
  });

  it("Cancelar en la pantalla de nueva contraseña cierra la sesión de recuperación", async () => {
    jest
      .mocked(Linking.getInitialURL)
      .mockResolvedValue(
        `trazza://reset-password#access_token=access-${JUAN.id}&refresh_token=r&type=recovery`
      );
    await render(
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    );

    await fireEvent.press(await screen.findByText("Cancelar"));
    expect(await screen.findByText("Iniciar sesión")).toBeTruthy();
    expect(mockSupabase.client.auth.signOut).toHaveBeenCalled();
  });

  it("un enlace expirado no abre la pantalla de nueva contraseña", async () => {
    jest
      .mocked(Linking.getInitialURL)
      .mockResolvedValue("trazza://reset-password#error=access_denied&error_code=otp_expired");
    await renderApp();

    await waitFor(() => expect(Linking.getInitialURL).toHaveBeenCalled());
    expect(screen.queryByText("Guardar contraseña")).toBeNull();
    expect(mockSupabase.client.auth.setSession).not.toHaveBeenCalled();
  });
});
