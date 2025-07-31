import { Link } from "react-router-dom";

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-blue-900 text-white p-4 space-y-4">
        <h2 className="text-2xl font-bold">F.A.V.S.</h2>
        <nav className="flex flex-col space-y-2">
          <Link to="/" className="hover:underline">
            Početna
          </Link>
          <Link to="/match/1" className="hover:underline">
            Utakmica #1
          </Link>
          <Link to="/match/2" className="hover:underline">
            Utakmica #2
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 bg-gray-100">{children}</main>
    </div>
  );
}
