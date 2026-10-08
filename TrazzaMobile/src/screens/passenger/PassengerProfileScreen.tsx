import React from "react";
import { ProfileScreenBase } from "../../components/ProfileScreenBase";

export default function PassengerProfileScreen() {
  return (
    <ProfileScreenBase
      roleLabel="Pasajero"
      items={[
        { icon: "person-outline", label: "Datos personales" },
        { icon: "notifications-outline", label: "Notificaciones" },
        { icon: "shield-checkmark-outline", label: "Privacidad y seguridad" },
        { icon: "help-circle-outline", label: "Ayuda y soporte" },
      ]}
    />
  );
}
