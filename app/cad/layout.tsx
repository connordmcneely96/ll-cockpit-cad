import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function CadLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const email = hdrs.get("x-user-email") ?? "";

  return (
    <div>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#fff",
          borderBottom: "1px solid #ececec",
          padding: "0.75rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <a
            href="/cad"
            style={{ fontWeight: 800, color: "#c96442", textDecoration: "none", fontSize: "1.05rem", letterSpacing: "0.02em" }}
          >
            NEXUS CAD
          </a>
          <a href="/cad" style={{ color: "#555", textDecoration: "none", fontSize: "0.9rem", marginLeft: "1.5rem" }}>
            Home
          </a>
          <a href="/cad/projects" style={{ color: "#555", textDecoration: "none", fontSize: "0.9rem", marginLeft: "1.5rem" }}>
            Projects
          </a>
        </div>
        {email && (
          <span style={{ color: "#888", fontSize: "0.8rem" }}>{email}</span>
        )}
      </nav>
      <div>{children}</div>
    </div>
  );
}
