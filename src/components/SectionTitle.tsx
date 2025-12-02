/* ============================================================
   COMPONENTE DE TÍTULO PADRÃO — VERSÃO PROFISSIONAL
============================================================ */
type SectionTitleProps = {
  title: string;
  subtitle?: string;
  infoTooltip?: string;
};

const SectionTitle = ({ title, subtitle, infoTooltip }: SectionTitleProps) => {
  return (
    <header
      style={{
        textAlign: "center",
        marginBottom: 28,
        marginTop: 10,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "1.45rem",
          fontWeight: 700,
          color: "#111827",
          lineHeight: 1.3,
          textShadow: "0 1px 1px rgba(0,0,0,0.06)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {title}

        {infoTooltip && (
          <span
            title={infoTooltip}
            style={{
              fontSize: "0.9rem",
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
            fontWeight: 400,
          }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
};
