import React from "react";
import { ProfileScreenBase } from "../../components/ProfileScreenBase";

// Sin opciones de menú hasta que existan pantallas reales para ellas
// (antes había 4 opciones que no hacían nada al tocarlas).
export default function PassengerProfileScreen() {
  return <ProfileScreenBase roleLabel="Pasajero" />;
}
