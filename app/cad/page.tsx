import { headers } from "next/headers";

export default async function CadPage() {
  const hdrs = await headers();
  const email = hdrs.get("x-user-email") ?? "";

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f4f1" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "2.5rem 3rem", boxShadow: "0 2px 16px rgba(0,0,0,0.07)", maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#c96442", marginBottom: "0.5rem" }}>CAD workspace</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>Coming in Sprint 30J.</p>
        {email && (
          <p style={{ fontSize: "0.875rem", color: "#888" }}>{email}</p>
        )}
      </div>
    </main>
  );
}
