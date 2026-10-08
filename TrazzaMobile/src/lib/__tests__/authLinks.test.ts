import { getPasswordResetRedirectUrl, parseAuthRedirect } from "../authLinks";

describe("parseAuthRedirect", () => {
  it("lee los tokens del fragmento (flujo implícito de recuperación)", () => {
    expect(
      parseAuthRedirect(
        "trazza://reset-password#access_token=abc&refresh_token=def&expires_in=3600&type=recovery"
      )
    ).toEqual({ type: "tokens", accessToken: "abc", refreshToken: "def", isRecovery: true });
  });

  it("lee el código PKCE de la query", () => {
    expect(parseAuthRedirect("trazza://reset-password?code=xyz")).toEqual({
      type: "code",
      code: "xyz",
      isRecovery: true,
    });
  });

  it("marca como no-recuperación un enlace de otro tipo", () => {
    expect(parseAuthRedirect("trazza://auth#access_token=a&refresh_token=b&type=signup")).toEqual({
      type: "tokens",
      accessToken: "a",
      refreshToken: "b",
      isRecovery: false,
    });
  });

  it("devuelve el error decodificado cuando el enlace expiró", () => {
    expect(
      parseAuthRedirect(
        "trazza://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
      )
    ).toEqual({ type: "error", message: "Email link is invalid or has expired" });
  });

  it("ignora URLs sin datos de autenticación", () => {
    expect(parseAuthRedirect("trazza://")).toBeNull();
    expect(parseAuthRedirect("trazza://reset-password")).toBeNull();
  });
});

it("usa el esquema de la app como redirectTo", () => {
  expect(getPasswordResetRedirectUrl()).toBe("trazza://reset-password");
});
