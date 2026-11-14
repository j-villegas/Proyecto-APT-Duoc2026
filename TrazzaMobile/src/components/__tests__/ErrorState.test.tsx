import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ErrorState } from "../ErrorState";

it("sin conexión lo dice claro y permite reintentar", async () => {
  const onRetry = jest.fn();
  await render(<ErrorState what="tus rutas" error={{ message: "Network request failed" }} onRetry={onRetry} />);

  expect(screen.getByText("Sin conexión")).toBeTruthy();
  expect(screen.getByText("Sin conexión. Revisa tu señal o Wi-Fi e intenta de nuevo.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Reintentar"));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it("otros errores indican qué no se pudo cargar, sin mensajes técnicos", async () => {
  await render(
    <ErrorState what="tu historial" error={{ code: "XX000", message: "relation does not exist" }} onRetry={jest.fn()} />
  );
  expect(screen.getByText("No pudimos cargar tu historial")).toBeTruthy();
  expect(screen.queryByText(/relation does not exist/)).toBeNull();
});
