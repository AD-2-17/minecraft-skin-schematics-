import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Landing from "./pages/Landing";

const Studio = lazy(() => import("./pages/Studio"));

function TitleAndScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = pathname.startsWith("/app") ? "Studio · Skin Schematic" : "Skin Schematic";
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <TitleAndScroll />
      <Suspense fallback={<div className="route-loading" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Studio />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
