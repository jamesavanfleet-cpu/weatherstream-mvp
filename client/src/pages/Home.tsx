import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Anchor, ArrowRight, Calendar, Cloud, CloudRain, Droplets, Info,
  MapPin, Play, Ship, Sparkles, ThermometerSun, TrendingUp, 
  Wind, Zap 
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * WeatherStream - Next-Gen Weather Platform
 * 
 * Design Philosophy: Video-First, Cinematic, Interactive
 * - Full-screen video hero with glassmorphism overlays
 * - Dark mode for premium, streaming-service aesthetic
 * - Animated gradients and micro-interactions everywhere
 * - Live data with smooth transitions
 * - Depth through layering and blur effects
 */

const HERO_BG = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-1_1771041482000_na1fn_aGVyby13ZWF0aGVyLXNreQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTFfMTc3MTA0MTQ4MjAwMF9uYTFmbl9hR1Z5YnkxM1pXRjBhR1Z5TFhOcmVRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=KK1QCR0Sl1y9Qj73ab1HaJtPQGQmBqHWEETKpj0bxlATD3yG0YKMw16CmQOQsGjyHrUxOK2fz-yg6rUb2Fb7EoxbRPv7X4us15i~UJLNQVRy1aSjGM-j5v8heuuf1kI4CoNiUbJC~dsNriGf04Pm3rB8T6iiuy2s0gF0XWoedgi8X3NJ0QvwVKBsGIo0xjCTum6mLeNpRSCqX61YnpLiOJA0mwlFv3uXtnV7pNQa20Lvy~h~D1-uQmI-wvl4ZKlES4~1rBay9PkyXWogmok0HeL5vl~cji-i4Xnogbg8e7Yblw2dARmBsM9bCiThkU9Upqi-whLcqapz0EpzfuUH8A__";
const CRUISE_SUNSET = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-2_1771041480000_na1fn_Y2FyaWJiZWFuLWNydWlzZS1zdW5zZXQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTJfMTc3MTA0MTQ4MDAwMF9uYTFmbl9ZMkZ5YVdKaVpXRnVMV055ZFdselpTMXpkVzV6WlhRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=q7HRCQyQ~-w~C5w33nY2ql2sG3uXJCzYOhBWvxdtDbze05vqRtYbS1MyRLwFD-TcVNJiFFpZJHcV2VwV~1q2R3cALqcMsvdGRwHnu21~weD8Sbi-uWiSdqPpU9WlWn2TKGKSeggtUFRQyfGACZXSWEN8fFARTbR6zzad3L~CHbe4XhsMPFnsc3p-wyMqi~d0BXyI285CVEa7MEblcdb65PW9fdjkfHT~qRlFn6r07oCoZ0-QNyv5bieV7Uc3tjnaZPINOxgUEUae~nkcYOMaSW3rbEpaeOPirXqd8MTpAakVSef6F4V~VkghbCiPu~VmHDnSaWoQ6uLrTOXc4UCehA__";
const TROPICAL_BEACH = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-4_1771041481000_na1fn_dHJvcGljYWwtYmVhY2gtd2VhdGhlcg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTRfMTc3MTA0MTQ4MTAwMF9uYTFmbl9kSEp2Y0dsallXd3RZbVZoWTJndGQyVmhkR2hsY2cucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=gc3iC93INNkqrzR5EnGIKflyv9FZdTH2fcgfdAbMjhXxoCZjknQ5xd9PeoZfZIuPgpkgSKejVD--ZpA7V17td1MzXUUjYzjxXZntB4pNkCjJYyWtpcW1PhtJoRFqVtUCsUAyhpxkxIbNWc8pWg2Lb7hCro~xzqd7PmRe2J2nO21MUlSzZmuIG1ogNLRm7UeSmtlxqvuQozC~DnA8ux49xns-BKzSBXIfPHW6FZKDKdqcQSP2nYkS9FZCLwtX2dyf~cwa78K5P0KYg3twSHu5t9UQGasE4Brn8NEIVTsP2ECZxrNdoc7urtkzPyCZlM3ZfeeOoA9iZ6bI5mvbgSD3bA__";

const LIVE_DATA = [
  { location: "Miami", temp: 78, condition: "Sunny", icon: ThermometerSun, color: "from-orange-500 to-yellow-500" },
  { location: "San Juan", temp: 84, condition: "Partly Cloudy", icon: Cloud, color: "from-blue-400 to-cyan-400" },
  { location: "Cozumel", temp: 86, condition: "Clear", icon: Sparkles, color: "from-yellow-400 to-orange-400" },
  { location: "Nassau", temp: 77, condition: "Breezy", icon: Wind, color: "from-cyan-400 to-blue-500" }
];

const CRUISE_ROUTES = [
  {
    name: "Eastern Caribbean",
    image: TROPICAL_BEACH,
    temp: 84,
    seas: "2-3 ft",
    wind: "10-15 kt",
    rain: "5%",
    status: "Perfect",
    gradient: "from-emerald-500/20 to-cyan-500/20",
    intel: "High pressure dominating the region through the weekend. Expect light trade winds and calm seas—ideal for tender operations in St. Thomas and St. Maarten. UV index will be extreme, so remind passengers about sun protection."
  },
  {
    name: "Western Caribbean",
    image: CRUISE_SUNSET,
    temp: 86,
    seas: "3-4 ft",
    wind: "12-18 kt",
    rain: "10%",
    status: "Excellent",
    gradient: "from-orange-500/20 to-pink-500/20",
    intel: "Typical February pattern with easterly flow. Cozumel and Grand Cayman will see afternoon sea breezes—perfect beach weather. Watch for isolated showers near Jamaica's Blue Mountains in the late afternoon, but they'll stay inland."
  },
  {
    name: "Bahamas",
    image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop",
    temp: 77,
    seas: "3-5 ft",
    wind: "15-20 kt",
    rain: "20%",
    status: "Very Good",
    gradient: "from-blue-500/20 to-purple-500/20",
    intel: "Cold front passed through yesterday—cooler temps but crystal-clear visibility. Seas building slightly on the Atlantic side, but western anchorages (Nassau, Freeport) remain protected. Great conditions for snorkeling and diving with 100+ ft visibility."
  }
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleIntel, setVisibleIntel] = useState<number | null>(null);
  const cruiseRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll-triggered intel expansion
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = cruiseRefs.current.indexOf(entry.target as HTMLDivElement);
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setVisibleIntel(index);
          } else if (!entry.isIntersecting && visibleIntel === index) {
            setVisibleIntel(null);
          }
        });
      },
      { threshold: [0.5, 0.6, 0.7] }
    );

    cruiseRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [visibleIntel]);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success("🎉 Welcome to WeatherStream! Check your inbox.");
    setEmail("");
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen gradient-animate">
      {/* Floating Header with Glassmorphism */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-dark border-b border-white/5">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-accent shadow-2xl">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">VanFleet Wx</h1>
              <p className="text-xs text-white/60">Weather Intelligence</p>
            </div>
          </div>
          
          <Button size="sm" className="bg-gradient-to-r from-primary to-accent hover:opacity-90 border-0 shadow-lg glow">
            <Sparkles className="w-3 h-3 mr-2" />
            Subscribe Free
          </Button>
        </div>
      </header>

      {/* Full-Screen Video Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <img 
            src={HERO_BG} 
            alt="Weather" 
            className="w-full h-full object-cover opacity-30 scale-110 animate-[pulse_20s_ease-in-out_infinite]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
        </div>
        
        {/* Content */}
        <div className="container relative z-10 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div className="space-y-6">
            <Badge className="glass border-white/20 text-white backdrop-blur-xl">
              <TrendingUp className="w-3 h-3 mr-1" />
              30+ Years | Royal Caribbean Chief Met
            </Badge>
            
            <h2 className="text-6xl md:text-7xl font-black tracking-tighter leading-none">
              <span className="bg-gradient-to-r from-white via-blue-100 to-cyan-200 bg-clip-text text-transparent">
                VanFleet<br />Weather Intelligence
              </span>
            </h2>
            
            <p className="text-xl text-white/80 leading-relaxed max-w-xl">
              Daily video briefings, live Caribbean cruise forecasts, and breaking storm analysis 
              from <span className="text-white font-semibold">James Van Fleet</span>, former Royal Caribbean Chief Meteorologist.
            </p>
            
            <div className="flex gap-3">
              <Button size="lg" className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white border-0 shadow-2xl glow-accent">
                <Play className="w-5 h-5 mr-2" />
                Watch Today's Briefing
              </Button>
            </div>
          </div>
          
          {/* Right: Video Player */}
          <div className="relative">
            <div className="glass-dark rounded-3xl overflow-hidden shadow-2xl glow-accent border-2 border-white/10">
              <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-800 relative group cursor-pointer">
                {/* Video Placeholder */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-24 h-24 rounded-full glass flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 glow">
                    <Play className="w-12 h-12 text-white ml-1" />
                  </div>
                  <p className="text-white font-semibold text-lg">Today's Weather Briefing</p>
                  <p className="text-white/60 text-sm">February 14, 2026 • 4:32</p>
                </div>
                
                {/* Live Badge */}
                <div className="absolute top-4 right-4 glass-dark px-3 py-1.5 rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-white text-xs font-semibold">NEW</span>
                </div>
              </div>
              
              {/* Video Info */}
              <div className="p-6 glass-dark border-t border-white/5">
                <h3 className="text-white font-bold text-lg mb-2">Arctic Blast Sweeps Midwest, Caribbean Perfect</h3>
                <p className="text-white/60 text-sm">Dangerous wind chills hit the central U.S. while Caribbean cruise routes enjoy perfect conditions.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Conditions - Animated Cards */}
      <section className="py-12 relative">
        <div className="container">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
            <h3 className="text-2xl font-bold text-white">Live Conditions</h3>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {LIVE_DATA.map((loc, i) => (
              <div 
                key={loc.location}
                className="glass-dark rounded-2xl p-6 hover:scale-105 transition-all duration-300 cursor-pointer group border border-white/5 hover:border-white/20"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-white/60 text-sm mb-1">{loc.location}</p>
                    <p className="text-4xl font-black text-white">{loc.temp}°</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${loc.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <loc.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <p className="text-white/80 text-sm font-medium">{loc.condition}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Caribbean Cruise Weather - Premium Cards */}
      <section className="py-20 relative overflow-hidden">
        {/* Decorative Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-3xl opacity-20" />
        
        <div className="container relative z-10">
          <div className="text-center mb-12">
            <Badge className="glass border-white/20 text-white backdrop-blur-xl mb-4">
              <Ship className="w-4 h-4 mr-1" />
              James's Specialty
            </Badge>
            <h3 className="text-5xl font-black text-white mb-4 tracking-tight">
              Caribbean Cruise Weather
            </h3>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              7-day forecasts from the meteorologist who protected Royal Caribbean's fleet for 6+ years
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {CRUISE_ROUTES.map((route, i) => (
              <div 
                key={route.name}
                ref={(el) => { cruiseRefs.current[i] = el; }}
                className="group cursor-pointer"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="glass-dark rounded-3xl overflow-hidden border border-white/10 hover:border-white/30 transition-all duration-500 hover:scale-105 hover:shadow-2xl">
                  {/* Image with Gradient Overlay */}
                  <div className="relative h-64 overflow-hidden">
                    <img 
                      src={route.image} 
                      alt={route.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-t ${route.gradient} to-transparent`} />
                    
                    {/* Weather Intel - Auto-expands on scroll */}
                    <div 
                      className={`absolute inset-x-4 bottom-20 transition-all duration-500 ${
                        visibleIntel === i 
                          ? 'opacity-100 translate-y-0' 
                          : 'opacity-0 translate-y-4 pointer-events-none'
                      }`}
                    >
                      <div className="bg-slate-950/95 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Sparkles className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm mb-1.5">James's Intel</p>
                            <p className="text-white text-xs leading-relaxed">{route.intel}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Floating Status Badge */}
                    <div className="absolute top-4 right-4 glass px-4 py-2 rounded-full">
                      <span className="text-white font-bold text-sm">{route.status}</span>
                    </div>
                    
                    {/* Route Name */}
                    <div className="absolute bottom-4 left-4 right-4">
                      <h4 className="text-2xl font-black text-white mb-2">{route.name}</h4>
                    </div>
                  </div>
                  
                  {/* Weather Data Grid */}
                  <div className="p-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="glass rounded-xl p-3 text-center">
                        <ThermometerSun className="w-5 h-5 mx-auto mb-2 text-orange-400" />
                        <p className="text-2xl font-bold text-white">{route.temp}°</p>
                        <p className="text-xs text-white/60">Temperature</p>
                      </div>
                      
                      <div className="glass rounded-xl p-3 text-center">
                        <CloudRain className="w-5 h-5 mx-auto mb-2 text-blue-400" />
                        <p className="text-2xl font-bold text-white">{route.seas}</p>
                        <p className="text-xs text-white/60">Sea State</p>
                      </div>
                      
                      <div className="glass rounded-xl p-3 text-center">
                        <Wind className="w-5 h-5 mx-auto mb-2 text-cyan-400" />
                        <p className="text-2xl font-bold text-white">{route.wind}</p>
                        <p className="text-xs text-white/60">Wind</p>
                      </div>
                      
                      <div className="glass rounded-xl p-3 text-center">
                        <Droplets className="w-5 h-5 mx-auto mb-2 text-purple-400" />
                        <p className="text-2xl font-bold text-white">{route.rain}</p>
                        <p className="text-xs text-white/60">Rain Chance</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Email Signup - Premium CTA */}
      <section className="py-20 relative">
        <div className="container">
          <div className="max-w-3xl mx-auto glass-dark rounded-3xl p-12 border border-white/10 shadow-2xl glow-accent relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
            
            <div className="relative z-10 text-center space-y-6">
              <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full border border-white/20 mb-4">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-white text-sm font-semibold">Join 8,500+ Subscribers</span>
              </div>
              
              <h3 className="text-4xl font-black text-white mb-4 tracking-tight">
                Get VanFleet Intel Daily
              </h3>            
              <p className="text-lg text-white/70 max-w-xl mx-auto">
                Get James's daily video briefings and weekly cruise forecasts delivered to your inbox. 
                <strong className="text-white block mt-2">No spam. No hype. Just weather you can trust.</strong>
              </p>
              
              <form onSubmit={handleEmailSignup} className="max-w-md mx-auto">
                <div className="flex gap-3">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 h-14 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-white/40 rounded-xl"
                    required
                  />
                  <Button 
                    type="submit" 
                    disabled={isSubmitting} 
                    size="lg" 
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90 border-0 shadow-xl glow-accent px-8"
                  >
                    {isSubmitting ? "..." : <ArrowRight className="w-5 h-5" />}
                  </Button>
                </div>
              </form>
              
              <div className="flex items-center justify-center gap-6 text-sm text-white/60">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Daily briefings</span>
                </div>
                <div className="flex items-center gap-2">
                  <Ship className="w-4 h-4" />
                  <span>Cruise forecasts</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  <span>Storm alerts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 glass-dark">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">VanFleet Wx</p>
                <p className="text-white/60 text-xs">Weather Intelligence by James Van Fleet</p>
              </div>
            </div>
            
            <p className="text-white/40 text-xs">
              © 2026 VanFleet Wx. Weather Intelligence by James Van Fleet.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
