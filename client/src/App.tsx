import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect } from "react";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BookBriefing from "./pages/BookBriefing";
import Home from "./pages/Home";
import RegionDetail from "./pages/RegionDetail";
import RouteMap from "./pages/RouteMap";

// Strip trailing slash from Vite's BASE_URL for wouter base path compatibility
const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// Detects sessionStorage.sharedItinerary set by index.html SPA redirect handler
// and navigates to /route-map so the itinerary loads correctly from a shared link
function SharedRouteRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (sessionStorage.getItem("sharedItinerary")) {
      navigate("/route-map");
    }
  }, [navigate]);
  return null;
}

function Router() {
  return (
    <WouterRouter base={basePath}>
      <SharedRouteRedirect />
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/book-briefing"} component={BookBriefing} />
        <Route path={"/region/:slug"} component={RegionDetail} />
        <Route path={"/route-map"} component={RouteMap} />
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
