import type { ReactNode } from "react";

type TitleWithTooltipProps = {
  children: ReactNode;
  tooltip: string;
  className?: string;
};

export default function TitleWithTooltip({ children, tooltip, className }: TitleWithTooltipProps) {
  return (
    <span className={`tooltip-wrapper ${className || ""}`}>
      {children}
      <span className="tooltip-box">{tooltip}</span>
    </span>
  );
}
