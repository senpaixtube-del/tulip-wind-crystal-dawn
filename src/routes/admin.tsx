import { createFileRoute } from "@tanstack/react-router";
import { AdminPanel } from "@/components/game/Panels";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  return (
    <main className="min-h-dvh bg-bg p-4">
      <AdminPanel onClose={() => {}} />
      <Link to="/" className="relative z-30 text-sm text-cyan">
        Back
      </Link>
    </main>
  );
}
