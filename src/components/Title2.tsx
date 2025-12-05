/* ============================================================
   COMPONENTE DE TÍTULO AVANÇADO — "TITLE2"
   — Segue estilo do Economômetro / Visão Geral
   — Permite icone, subtítulo, tooltip e alinhamento central
============================================================ */

type Title2Props = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  infoTooltip?: string;
};

export const Title2 = ({ title, subtitle, icon, infoTooltip }: Title2Props) => {
  return (
    <header
      style={{
        textAlign: "center",
        marginTop: 10,
        marginBottom: 26,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "1.55rem",
          fontWeight: 700,
          color: "#111827",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          textShadow: "0 1px 1px rgba(0,0,0,0.05)",
        }}
      >
        {icon && (
          <span
            style={{
              fontSize: "1.6rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            {icon}
          </span>
        )}

        {title}

        {infoTooltip && (
          <span
            title={infoTooltip}
            style={{
              fontSize: "1rem",
              cursor: "help",
              color: "#6b7280",
              marginTop: 2,
            }}
          >
            ℹ️
          </span>
        )}
      </h2>

      {subtitle && (
        <p
          style={{
            marginTop: 6,
            color: "#6b7280",
            fontSize: "0.95rem",
          }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
};
