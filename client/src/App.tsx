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

// Strip trailing slash from Vite's BASE_URL for wouter base path compatibility
const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

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
