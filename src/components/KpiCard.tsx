export default function KpiCard({ title, value }: { title: string; value: any }) {
  return (
    <div
      style={{
        background: "#ffffff",
        padding: "18px 22px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minWidth: 140,
      }}
    >
      <span
        style={{
          fontSize: ".85rem",
          color: "#6b7280",
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {title}
      </span>

      <strong
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          color: "#1e3a8a",
          lineHeight: 1,
        }}
      >
        {value}
      </strong>
    </div>
  );
}
