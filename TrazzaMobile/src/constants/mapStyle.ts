// Estilo oscuro de Google Maps alineado a la identidad de marca TRAZZA.
export const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0C2340" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8EA3C4" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0B1D3A" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1B3A63" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#16314F" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6C87AD" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1E426E" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#081729" }] },
];
