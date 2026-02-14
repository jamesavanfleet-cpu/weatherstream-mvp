import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Anchor, ArrowRight, Calendar, Cloud, CloudRain, MapPin, Play, Ship, Sun, ThermometerSun, TrendingUp, Wind } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * WeatherStream MVP - Visual-First Design
 * 
 * Design Philosophy: Modern, Engaging, Premium
 * - Hero with dramatic weather imagery
 * - Video-first content layout
 * - Rich data visualizations
 * - Smooth animations and transitions
 * - Caribbean cruise weather as signature feature
 */

const HERO_BG = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-1_1771041482000_na1fn_aGVyby13ZWF0aGVyLXNreQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTFfMTc3MTA0MTQ4MjAwMF9uYTFmbl9hR1Z5YnkxM1pXRjBhR1Z5TFhOcmVRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=KK1QCR0Sl1y9Qj73ab1HaJtPQGQmBqHWEETKpj0bxlATD3yG0YKMw16CmQOQsGjyHrUxOK2fz-yg6rUb2Fb7EoxbRPv7X4us15i~UJLNQVRy1aSjGM-j5v8heuuf1kI4CoNiUbJC~dsNriGf04Pm3rB8T6iiuy2s0gF0XWoedgi8X3NJ0QvwVKBsGIo0xjCTum6mLeNpRSCqX61YnpLiOJA0mwlFv3uXtnV7pNQa20Lvy~h~D1-uQmI-wvl4ZKlES4~1rBay9PkyXWogmok0HeL5vl~cji-i4Xnogbg8e7Yblw2dARmBsM9bCiThkU9Upqi-whLcqapz0EpzfuUH8A__";
const CRUISE_SUNSET = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-2_1771041480000_na1fn_Y2FyaWJiZWFuLWNydWlzZS1zdW5zZXQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTJfMTc3MTA0MTQ4MDAwMF9uYTFmbl9ZMkZ5YVdKaVpXRnVMV055ZFdselpTMXpkVzV6WlhRLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=q7HRCQyQ~-w~C5w33nY2ql2sG3uXJCzYOhBWvxdtDbze05vqRtYbS1MyRLwFD-TcVNJiFFpZJHcV2VwV~1q2R3cALqcMsvdGRwHnu21~weD8Sbi-uWiSdqPpU9WlWn2TKGKSeggtUFRQyfGACZXSWEN8fFARTbR6zzad3L~CHbe4XhsMPFnsc3p-wyMqi~d0BXyI285CVEa7MEblcdb65PW9fdjkfHT~qRlFn6r07oCoZ0-QNyv5bieV7Uc3tjnaZPINOxgUEUae~nkcYOMaSW3rbEpaeOPirXqd8MTpAakVSef6F4V~VkghbCiPu~VmHDnSaWoQ6uLrTOXc4UCehA__";
const TROPICAL_BEACH = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-4_1771041481000_na1fn_dHJvcGljYWwtYmVhY2gtd2VhdGhlcg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTRfMTc3MTA0MTQ4MTAwMF9uYTFmbl9kSEp2Y0dsallXd3RZbVZoWTJndGQyVmhkR2hsY2cucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=gc3iC93INNkqrzR5EnGIKflyv9FZdTH2fcgfdAbMjhXxoCZjknQ5xd9PeoZfZIuPgpkgSKejVD--ZpA7V17td1MzXUUjYzjxXZntB4pNkCjJYyWtpcW1PhtJoRFqVtUCsUAyhpxkxIbNWc8pWg2Lb7hCro~xzqd7PmRe2J2nO21MUlSzZmuIG1ogNLRm7UeSmtlxqvuQozC~DnA8ux49xns-BKzSBXIfPHW6FZKDKdqcQSP2nYkS9FZCLwtX2dyf~cwa78K5P0KYg3twSHu5t9UQGasE4Brn8NEIVTsP2ECZxrNdoc7urtkzPyCZlM3ZfeeOoA9iZ6bI5mvbgSD3bA__";
const JAMES_PROFILE = "https://private-us-east-1.manuscdn.com/sessionFile/XOLEdg9yZlg7uKRTFIx5OB/sandbox/KmIDdlWnVqsNKICKmf9H1h-img-5_1771041469000_na1fn_amFtZXMtcHJvZmlsZS1wbGFjZWhvbGRlcg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvWE9MRWRnOXlabGc3dUtSVEZJeDVPQi9zYW5kYm94L0ttSURkbFduVnFzTktJQ0ttZjlIMWgtaW1nLTVfMTc3MTA0MTQ2OTAwMF9uYTFmbl9hbUZ0WlhNdGNISnZabWxzWlMxd2JHRmpaV2h2YkdSbGNnLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=ET-RJo8idXUFcr2aowT~e3Xm20ISv0ivfrPdhgB~NSfz1Ngi11cRIdHzazpQaO2bECSd5hKq7KNe9fbm6INSEHSHPmG6jH7o2O9OSPYKgGmI0GsQgK6zA20SH-6qFme7ZAjaiPqVMqkfcgKSAxFgkEBwG4x3rpvV5S7UOCoGDnZmTsAFaLALG06lrOp0EdZet7lvLUUPC1vbOJzJOaUTDL8QYLFLnWp690hvhC0VKc~JoA1NmrXtXT4NyZRPrlBAtH8rlQ0Mn5-jxb5X7R9irfDZpbh4GF5a7UcFUiTVx~vLTToZRPoNuHM4nCgY9UMP3tT4LWAnSCdQ2yK-3u~rSg__";

const TODAY_BRIEFING = {
  date: "February 14, 2026",
  title: "Arctic Blast Sweeps Across Midwest, Caribbean Remains Calm",
  summary: "A powerful cold front is bringing dangerous wind chills to the central U.S., while the Caribbean enjoys perfect cruise weather with calm seas and sunny skies.",
  videoUrl: null
};

const LIVE_CONDITIONS = [
  { location: "Miami, FL", temp: 78, condition: "Sunny", icon: Sun, trend: "stable" },
  { location: "San Juan, PR", temp: 84, condition: "Partly Cloudy", icon: Cloud, trend: "up" },
  { location: "Cozumel, MX", temp: 86, condition: "Clear", icon: Sun, trend: "up" },
  { location: "Nassau, BS", temp: 77, condition: "Breezy", icon: Wind, trend: "down" }
];

const CRUISE_DESTINATIONS = [
  {
    name: "Eastern Caribbean",
    image: TROPICAL_BEACH,
    temp: "82-85°F",
    seas: "2-3 ft",
    wind: "10-15 kt",
    conditions: "Perfect",
    description: "Ideal conditions across all major ports. St. Thomas, St. Maarten, and San Juan looking excellent.",
    icon: Ship
  },
  {
    name: "Western Caribbean",
    image: CRUISE_SUNSET,
    temp: "84-87°F",
    seas: "3-4 ft",
    wind: "12-18 kt",
    conditions: "Excellent",
    description: "Warm and calm throughout the week. Cozumel, Grand Cayman, and Jamaica perfect for excursions.",
    icon: Anchor
  },
  {
    name: "Bahamas",
    image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop",
    temp: "76-79°F",
    seas: "3-5 ft",
    wind: "15-20 kt",
    conditions: "Very Good",
    description: "Slightly cooler with brief showers possible Tuesday. Overall great conditions for sailing.",
    icon: MapPin
  }
];

const WEATHER_STORIES = [
  {
    title: "Why This Week's Arctic Outbreak Is Different",
    date: "Feb 13, 2026",
    category: "Analysis",
    excerpt: "The polar vortex has split, sending unprecedented cold into regions that rarely see these temperatures.",
    image: "https://images.unsplash.com/photo-1483664852095-d6cc6870702d?w=600&h=400&fit=crop",
    readTime: "5 min"
  },
  {
    title: "Hurricane Season 2026: Early Outlook",
    date: "Feb 10, 2026",
    category: "Forecast",
    excerpt: "NOAA's preliminary models suggest another active Atlantic season. Here's what it means for the Caribbean.",
    image: "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=600&h=400&fit=crop",
    readTime: "7 min"
  },
  {
    title: "Best Months to Book a Caribbean Cruise",
    date: "Feb 7, 2026",
    category: "Travel",
    excerpt: "After 20 years forecasting Caribbean weather, I reveal the sweet spots for perfect conditions.",
    image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&h=400&fit=crop",
    readTime: "4 min"
  }
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success("Welcome! Check your inbox for tomorrow's forecast.");
    setEmail("");
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">WeatherStream</h1>
              <p className="text-xs text-muted-foreground">by James Van Fleet</p>
            </div>
          </div>
          
          <Button size="sm" className="shadow-md" asChild>
            <a href="#subscribe">Subscribe Free</a>
          </Button>
        </div>
      </header>

      {/* Hero Section - Visual Impact */}
      <section className="relative min-h-[600px] flex items-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0">
          <img 
            src={HERO_BG} 
            alt="Dramatic weather sky" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/85 to-background/60" />
        </div>
        
        {/* Content */}
        <div className="container relative z-10">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-4 shadow-lg">
              <TrendingUp className="w-3 h-3 mr-1" />
              20 Years of Broadcast Experience
            </Badge>
            
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Weather Forecasts<br />
              <span className="text-primary">You Can Trust</span>
            </h2>
            
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Former Caribbean chief meteorologist <strong className="text-foreground">James Van Fleet</strong> delivers 
              daily weather briefings, breaking storm analysis, and expert cruise forecasts—straight talk, no hype.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="text-lg px-8 shadow-xl" asChild>
                <a href="#briefing">
                  <Play className="w-5 h-5 mr-2" />
                  Watch Today's Briefing
                </a>
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8" asChild>
                <a href="#travel">
                  <Ship className="w-5 h-5 mr-2" />
                  Cruise Weather
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Live Conditions Bar */}
      <section className="py-6 bg-gradient-to-r from-primary/5 to-accent/5 border-y">
        <div className="container">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Live Conditions</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {LIVE_CONDITIONS.map((loc) => (
              <div key={loc.location} className="bg-card rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{loc.location}</p>
                    <p className="text-2xl font-bold">{loc.temp}°</p>
                  </div>
                  <loc.icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">{loc.condition}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Today's Video Briefing */}
      <section id="briefing" className="py-16">
        <div className="container">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <Calendar className="w-7 h-7 text-primary" />
              <div>
                <h3 className="text-3xl font-bold">Today's Weather Briefing</h3>
                <p className="text-sm text-muted-foreground">{TODAY_BRIEFING.date}</p>
              </div>
            </div>
            
            <Card className="overflow-hidden shadow-2xl border-2">
              {/* Video Player Area */}
              <div className="relative aspect-video bg-gradient-to-br from-slate-900 to-slate-800">
                {TODAY_BRIEFING.videoUrl ? (
                  <div className="w-full h-full">
                    {/* YouTube embed will go here */}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-8">
                    <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Play className="w-10 h-10 text-white" />
                    </div>
                    <p className="text-lg font-semibold mb-2">Video Briefing Coming Soon</p>
                    <p className="text-sm text-white/70 text-center max-w-md">
                      James will post his daily 3-5 minute video analysis here. Subscribe to get notified.
                    </p>
                  </div>
                )}
              </div>
              
              <CardHeader className="bg-card/50">
                <CardTitle className="text-2xl">{TODAY_BRIEFING.title}</CardTitle>
                <CardDescription className="text-base mt-2">{TODAY_BRIEFING.summary}</CardDescription>
              </CardHeader>
              
              <CardContent className="pt-6">
                <Button className="w-full sm:w-auto" size="lg" asChild>
                  <a href="#subscribe">
                    Get Daily Briefings <ArrowRight className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Caribbean Cruise Weather - HERO FEATURE */}
      <section id="travel" className="py-20 bg-gradient-to-b from-accent/10 via-primary/5 to-background relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent rounded-full blur-3xl" />
        </div>
        
        <div className="container relative z-10">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4 shadow-md">
              <Ship className="w-4 h-4 mr-1" />
              James's Specialty
            </Badge>
            <h3 className="text-4xl font-bold mb-4">Caribbean Cruise Weather</h3>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Expert 7-day forecasts from a meteorologist who knows these waters inside and out
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {CRUISE_DESTINATIONS.map((dest) => (
              <Card key={dest.name} className="overflow-hidden hover:shadow-2xl transition-all duration-300 group border-2">
                <div className="relative h-56 overflow-hidden">
                  <img 
                    src={dest.image} 
                    alt={dest.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex items-center gap-2 mb-2">
                      <dest.icon className="w-5 h-5 text-white" />
                      <h4 className="text-xl font-bold text-white">{dest.name}</h4>
                    </div>
                    <Badge className="bg-green-500 text-white border-0">
                      {dest.conditions}
                    </Badge>
                  </div>
                </div>
                
                <CardContent className="pt-6">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center">
                      <ThermometerSun className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-muted-foreground">Temp</p>
                      <p className="text-sm font-semibold">{dest.temp}</p>
                    </div>
                    <div className="text-center">
                      <CloudRain className="w-5 h-5 mx-auto mb-1 text-accent" />
                      <p className="text-xs text-muted-foreground">Seas</p>
                      <p className="text-sm font-semibold">{dest.seas}</p>
                    </div>
                    <div className="text-center">
                      <Wind className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-muted-foreground">Wind</p>
                      <p className="text-sm font-semibold">{dest.wind}</p>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {dest.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="mt-10 text-center">
            <Button size="lg" variant="outline" className="shadow-lg" asChild>
              <a href="#subscribe">
                Get Weekly Cruise Forecasts <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Weather Stories */}
      <section className="py-16">
        <div className="container">
          <div className="mb-10">
            <h3 className="text-3xl font-bold mb-2">Recent Weather Stories</h3>
            <p className="text-lg text-muted-foreground">Expert analysis and forecasts from James</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl">
            {WEATHER_STORIES.map((story) => (
              <Card key={story.title} className="overflow-hidden hover:shadow-xl transition-all duration-300 group cursor-pointer">
                <div className="relative h-52 overflow-hidden">
                  <img 
                    src={story.image} 
                    alt={story.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 flex gap-2">
                    <Badge className="bg-primary/90 backdrop-blur-sm">
                      {story.category}
                    </Badge>
                    <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm">
                      {story.readTime}
                    </Badge>
                  </div>
                </div>
                
                <CardHeader>
                  <CardDescription className="text-xs mb-2">{story.date}</CardDescription>
                  <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                    {story.title}
                  </CardTitle>
                </CardHeader>
                
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {story.excerpt}
                  </p>
                  <Button variant="ghost" size="sm" className="w-full group-hover:bg-primary/5">
                    Read More <ArrowRight className="w-3 h-3 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Email Signup CTA */}
      <section id="subscribe" className="py-20 bg-gradient-to-br from-primary/10 via-accent/5 to-background">
        <div className="container">
          <Card className="max-w-3xl mx-auto shadow-2xl border-2">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-4xl mb-3">Never Miss a Forecast</CardTitle>
              <CardDescription className="text-lg">
                Get James's daily weather briefing and weekly cruise forecasts delivered to your inbox. 
                <strong className="text-foreground block mt-2">No spam, no hype—just the weather insights you need.</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSignup} className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 h-12 text-base"
                    required
                  />
                  <Button type="submit" disabled={isSubmitting} size="lg" className="sm:w-auto px-8 shadow-lg">
                    {isSubmitting ? "Subscribing..." : "Subscribe Free"}
                  </Button>
                </div>
                
                <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary text-xs">✓</span>
                    </div>
                    <span className="text-muted-foreground">Daily briefings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary text-xs">✓</span>
                    </div>
                    <span className="text-muted-foreground">Cruise forecasts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-primary text-xs">✓</span>
                    </div>
                    <span className="text-muted-foreground">Storm alerts</span>
                  </div>
                </div>
              </form>
              <p className="text-xs text-muted-foreground text-center mt-6">
                Free forever. Unsubscribe anytime. Your email stays private.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* About Section with Photo */}
      <section className="py-20 border-t">
        <div className="container">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="relative">
                <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl">
                  <img 
                    src={JAMES_PROFILE} 
                    alt="James Van Fleet" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-6 -right-6 bg-primary text-primary-foreground p-6 rounded-xl shadow-xl">
                  <p className="text-4xl font-bold">20</p>
                  <p className="text-sm">Years on TV</p>
                </div>
              </div>
              
              <div className="space-y-6">
                <h3 className="text-3xl font-bold">About James Van Fleet</h3>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    James Van Fleet is a professional meteorologist with <strong className="text-foreground">20 years of broadcast experience</strong>, 
                    including serving as chief meteorologist for Caribbean television. He's forecasted hundreds of tropical systems, 
                    winter storms, and severe weather events across North America and the Caribbean.
                  </p>
                  <p>
                    After being laid off twice as traditional TV weather declined, James created <strong className="text-foreground">WeatherStream</strong> to 
                    bring his expertise directly to people who need clear, trustworthy weather information—especially travelers planning cruises 
                    and vacations in weather-sensitive destinations.
                  </p>
                  <p className="text-base">
                    <strong className="text-foreground text-lg">No clickbait. No fear-mongering. Just honest forecasts from someone who's been doing this for two decades.</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 bg-card/30">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Cloud className="w-6 h-6 text-white" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-sm font-semibold">WeatherStream</p>
                <p className="text-xs text-muted-foreground">Professional Weather Forecasts by James Van Fleet</p>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground">
              © 2026 WeatherStream. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
