import { Link, useNavigate } from "react-router";


export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="w-full h-screen bg-base text-ink flex flex-col font-sans relative overflow-hidden">
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <div className="max-w-xl w-full flex flex-col items-center text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-[120px] font-bold tracking-tighter leading-none text-ink">
              404
            </h1>
            <h2 className="text-xl font-medium text-ink">
              Page not found
            </h2>
          </div>

          <div className="space-y-4 max-w-sm">
            <p className="text-sm text-muted leading-relaxed">
              The page you are looking for does not exist. It might have been moved or deleted.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 w-full sm:w-auto">
            <Link
              to="/overview"
              className="px-8 bg-accent text-accent-ink py-3 text-sm font-semibold rounded-hatch hover:bg-accent-hover transition-all text-center"
            >
              Back to Overview
            </Link>
            <button
              onClick={() => navigate(-1)}
              className="px-8 border border-line bg-transparent text-muted py-3 text-sm font-semibold rounded-hatch hover:text-ink hover:border-line-strong transition-all cursor-pointer"
            >
              Go Back
            </button>
          </div>
        </div>
      </main>

      <footer className="h-16 w-full border-t border-line px-8 flex items-center justify-center bg-base">
        <p className="text-[11px] text-faint tracking-widest uppercase">
          © {new Date().getFullYear()} Hatch Cloud
        </p>
      </footer>
    </div>
  );
}