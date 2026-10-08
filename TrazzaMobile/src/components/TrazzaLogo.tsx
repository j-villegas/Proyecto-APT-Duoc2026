import React from "react";
import Svg, { Circle, Path, Polygon } from "react-native-svg";
import { colors } from "../constants/theme";

export function TrazzaLogo({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Polygon
        points="50,4 93,27 93,73 50,96 7,73 7,27"
        stroke={colors.white}
        strokeWidth={5}
        fill="none"
      />
      <Path
        d="M24 66 L40 50 L52 60 L76 32"
        stroke={colors.brandAlt}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx="24" cy="66" r="5" fill={colors.white} />
      <Circle cx="76" cy="32" r="5" fill={colors.brandAlt} />
    </Svg>
  );
}
