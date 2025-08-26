import { Outlet } from "react-router-dom";
import Header from "../ui/Header";
import ScrollToTop from "../ui/ScrollToTop";

export default function AppLayout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <ScrollToTop />
    </>
  );
}
