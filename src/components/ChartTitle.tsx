export default function ChartTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header style={{ marginBottom: 10 }}>
      <h3
        style={{
          margin: 0,
          fontSize: "1rem",
          fontWeight: 600,
          color: "#111827",
        }}
      >
        {title}
      </h3>

      {subtitle && (
        <p
          style={{
            margin: "2px 0 0",
            color: "#6b7280",
            fontSize: ".85rem",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}
