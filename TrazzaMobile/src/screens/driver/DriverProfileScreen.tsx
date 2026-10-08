import React from "react";
import { ProfileScreenBase } from "../../components/ProfileScreenBase";

export default function DriverProfileScreen() {
  return (
    <ProfileScreenBase
      roleLabel="Conductor"
      items={[
        { icon: "person-outline", label: "Datos personales" },
        { icon: "car-outline", label: "Mi vehículo" },
        { icon: "document-text-outline", label: "Documentos" },
        { icon: "help-circle-outline", label: "Ayuda y soporte" },
      ]}
    />
  );
}
