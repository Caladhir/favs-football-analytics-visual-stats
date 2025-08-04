import { Outlet } from "react-router-dom";
import Header from "../ui/Header";
import ScrollToTop from "../ui/ScrollToTop";

export default function AppLayout() {
  return (
    <>
      <Header />
      <main className="pt-4 px-2 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <ScrollToTop />
    </>
  );
}
