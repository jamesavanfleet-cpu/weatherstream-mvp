import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BookBriefing from "./pages/BookBriefing";
import Home from "./pages/Home";
import RegionDetail from "./pages/RegionDetail";
import RouteMap from "./pages/RouteMap";
import TropicalAdvisories from "./pages/TropicalAdvisories";

// Strip trailing slash from Vite's BASE_URL for wouter base path compatibility
const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// Synchronous SPA redirect handler -- runs at module load time before React mounts.
// GitHub Pages 404.html redirects /route-map?itinerary=BASE64 to /?p=/route-map&q=itinerary=BASE64.
// We read these params here and reconstruct the correct URL so wouter routes correctly.
// This works regardless of which version of index.html is cached by the browser.
(function handleSPARedirect() {
  const search = window.location.search;
  if (!search) return;
  const params = new URLSearchParams(search);
  const p = params.get("p");
  const q = params.get("q");
  if (!p) return;
  // If this is a shared route map link, store the itinerary in sessionStorage
  if (p === "/route-map" && q && q.startsWith("itinerary=")) {
    const itineraryData = q.slice("itinerary=".length);
    try {
      sessionStorage.setItem("sharedItinerary", itineraryData);
    } catch (_) {}
  }
  // Reconstruct the correct URL and replace history so wouter sees the right path
  const newPath = basePath + p + (q ? "?" + q : "") + window.location.hash;
  window.history.replaceState(null, "", newPath);
})();

// HomeOrRouteMap: synchronously checks sessionStorage at render time.
// If a shared itinerary was stored by the index.html SPA redirect handler,
// render RouteMap directly instead of Home so the shared route loads immediately.
function HomeOrRouteMap() {
  if (sessionStorage.getItem("sharedItinerary")) {
    return <RouteMap />;
  }
  return <Home />;
}

function Router() {
  return (
    <WouterRouter base={basePath}>
      <Switch>
        <Route path={"/"} component={HomeOrRouteMap} />
        <Route path={"/book-briefing"} component={BookBriefing} />
        <Route path={"/region/:slug"} component={RegionDetail} />
        <Route path={"/route-map"} component={RouteMap} />
        <Route path={"/advisories"} component={TropicalAdvisories} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

// WeatherStream uses dark theme for modern, cinematic aesthetic
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
