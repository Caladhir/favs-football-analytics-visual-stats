import { useEffect, useState } from "react";
import { Icon } from "@iconify-icon/react";

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  // Show button after scroll down
  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 200) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed animate-bounce bottom-6 right-10 z-50 px-1 py-0.5 rounded-full bg-primary text-white hover:bg-red-600 transition-all shadow-lg"
      aria-label="Scroll to top"
    >
      <Icon icon="mdi:arrow-up" width={24} height={24} />
    </button>
  );
}
