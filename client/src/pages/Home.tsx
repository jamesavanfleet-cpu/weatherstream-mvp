import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Anchor, Calendar, Cloud, MapPin, Ship, ThermometerSun, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * WeatherStream MVP - James Van Fleet's Weather Platform
 * 
 * Design Philosophy: Expert Authority + Helpful Service
 * - James is the primary content creator, not a curator
 * - Focus on travel/cruise weather (his specialty)
 * - Daily briefings and breaking weather stories
 * - Clean, trustworthy, professional design
 */

// Sample content - James will replace with his actual forecasts
const TODAY_BRIEFING = {
  date: "February 14, 2026",
  title: "Arctic Blast Sweeps Across Midwest, Caribbean Remains Calm",
  summary: "A powerful cold front is bringing dangerous wind chills to the central U.S., while the Caribbean enjoys perfect cruise weather with calm seas and sunny skies. Here's what you need to know.",
  highlights: [
    "Midwest: Wind chills -20°F to -40°F through Sunday",
    "Caribbean: Ideal conditions for cruising, light winds, 82-85°F",
    "Gulf Coast: Watching potential development next week"
  ],
  videoUrl: null // Will be YouTube embed when James records
};

const TRAVEL_FORECAST = {
  title: "Caribbean Cruise Weather Outlook",
  period: "Next 7 Days",
  summary: "Excellent conditions across all major cruise routes. Seas 2-4 feet, winds 10-15 knots, zero tropical activity.",
  destinations: [
    {
      name: "Eastern Caribbean",
      icon: Ship,
      conditions: "Perfect",
      temp: "82-85°F",
      seas: "2-3 ft",
      confidence: "High",
      details: "Sunny skies, light winds. Ideal for all ports including St. Thomas, St. Maarten, and San Juan."
    },
    {
      name: "Western Caribbean",
      icon: Anchor,
      conditions: "Excellent",
      temp: "84-87°F",
      seas: "3-4 ft",
      confidence: "High",
      details: "Warm and calm. Cozumel, Grand Cayman, and Jamaica all looking great for shore excursions."
    },
    {
      name: "Bahamas",
      icon: MapPin,
      conditions: "Very Good",
      temp: "76-79°F",
      seas: "3-5 ft",
      confidence: "Medium",
      details: "Slightly cooler with brief showers possible Tuesday. Still excellent overall conditions."
    }
  ]
};

const WEATHER_STORIES = [
  {
    title: "Why This Week's Arctic Outbreak Is Different",
    date: "Feb 13, 2026",
    category: "Analysis",
    excerpt: "The polar vortex has split, sending unprecedented cold into regions that rarely see these temperatures. I break down the atmospheric setup and what it means for the next two weeks.",
    image: "https://images.unsplash.com/photo-1483664852095-d6cc6870702d?w=600&h=400&fit=crop"
  },
  {
    title: "Hurricane Season 2026: Early Outlook",
    date: "Feb 10, 2026",
    category: "Forecast",
    excerpt: "NOAA's preliminary models suggest another active Atlantic season. Here's what the El Niño transition means for the Caribbean and Gulf Coast.",
    image: "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=600&h=400&fit=crop"
  },
  {
    title: "Best Months to Book a Caribbean Cruise",
    date: "Feb 7, 2026",
    category: "Travel",
    excerpt: "After 20 years forecasting Caribbean weather, I reveal the sweet spots when you'll get perfect conditions and avoid the crowds.",
    image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&h=400&fit=crop"
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Cloud className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">WeatherStream</h1>
              <p className="text-xs text-muted-foreground">by James Van Fleet</p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" asChild>
            <a href="#subscribe">Subscribe</a>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-accent/5 to-background py-16 md:py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="space-y-6">
                <Badge variant="secondary" className="mb-2">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  20 Years of Broadcast Experience
                </Badge>
                
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                  Weather Forecasts You Can <span className="text-primary">Actually Trust</span>
                </h2>
                
                <p className="text-lg text-muted-foreground">
                  Former Caribbean chief meteorologist James Van Fleet delivers daily weather briefings, 
                  breaking storm analysis, and expert cruise weather forecasts—straight talk, no hype.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button size="lg" asChild>
                    <a href="#briefing">Today's Briefing</a>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <a href="#travel">Cruise Weather</a>
                  </Button>
                </div>
              </div>
              
              <div className="relative">
                <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 p-8 flex flex-col justify-center items-center text-center shadow-xl">
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Cloud className="w-12 h-12 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">James Van Fleet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Chief Meteorologist</p>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="font-bold text-2xl text-primary">20</p>
                      <p className="text-xs text-muted-foreground">Years on TV</p>
                    </div>
                    <Separator orientation="vertical" className="h-12" />
                    <div>
                      <p className="font-bold text-2xl text-accent">1000+</p>
                      <p className="text-xs text-muted-foreground">Forecasts</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Today's Briefing */}
      <section id="briefing" className="py-16 bg-card/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <Calendar className="w-6 h-6 text-primary" />
              <div>
                <h3 className="text-2xl font-bold">Today's Weather Briefing</h3>
                <p className="text-sm text-muted-foreground">{TODAY_BRIEFING.date}</p>
              </div>
            </div>
            
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">{TODAY_BRIEFING.title}</CardTitle>
                <CardDescription className="text-base mt-2">{TODAY_BRIEFING.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-primary/5 p-4 rounded-lg">
                  <p className="font-semibold mb-3 text-primary">Key Points:</p>
                  <ul className="space-y-2">
                    {TODAY_BRIEFING.highlights.map((highlight, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span className="text-sm">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {TODAY_BRIEFING.videoUrl ? (
                  <div className="aspect-video bg-muted rounded-lg">
                    {/* YouTube embed will go here */}
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      Video Player
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted/50 p-6 rounded-lg border-2 border-dashed border-border text-center">
                    <Cloud className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Video briefing coming soon. Subscribe to get notified when James posts his daily video analysis.
                    </p>
                  </div>
                )}
                
                <Button className="w-full sm:w-auto" asChild>
                  <a href="#subscribe">Get Daily Briefings in Your Inbox</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Travel & Cruise Weather - FEATURED */}
      <section id="travel" className="py-16 bg-gradient-to-b from-accent/5 to-background">
        <div className="container">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <Badge variant="secondary" className="mb-3">
                <Ship className="w-3 h-3 mr-1" />
                James's Specialty
              </Badge>
              <h3 className="text-3xl font-bold mb-3">{TRAVEL_FORECAST.title}</h3>
              <p className="text-lg text-muted-foreground">
                Expert Caribbean forecasts from a meteorologist who knows these waters inside and out
              </p>
            </div>
            
            <Card className="shadow-xl mb-6">
              <CardHeader className="bg-accent/5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">7-Day Outlook</CardTitle>
                    <CardDescription className="mt-1">{TRAVEL_FORECAST.summary}</CardDescription>
                  </div>
                  <ThermometerSun className="w-8 h-8 text-accent" />
                </div>
              </CardHeader>
            </Card>
            
            <div className="grid md:grid-cols-3 gap-6">
              {TRAVEL_FORECAST.destinations.map((dest) => (
                <Card key={dest.name} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                        <dest.icon className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{dest.name}</CardTitle>
                        <Badge variant="outline" className="mt-1 text-xs">
                          {dest.conditions}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Temperature</p>
                        <p className="font-semibold">{dest.temp}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Sea State</p>
                        <p className="font-semibold">{dest.seas}</p>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <p className="text-sm text-muted-foreground">{dest.details}</p>
                    
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Confidence:</span>
                      <Badge variant="secondary" className="text-xs">{dest.confidence}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="mt-8 text-center">
              <Button variant="outline" asChild>
                <a href="#subscribe">Get Weekly Cruise Weather Updates</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Weather Stories */}
      <section className="py-16">
        <div className="container">
          <div className="mb-8">
            <h3 className="text-3xl font-bold mb-2">Recent Weather Stories</h3>
            <p className="text-muted-foreground">Expert analysis and forecasts from James</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl">
            {WEATHER_STORIES.map((story) => (
              <Card key={story.title} className="overflow-hidden hover:shadow-lg transition-shadow group">
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={story.image} 
                    alt={story.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <Badge className="absolute top-3 left-3 bg-primary">
                    {story.category}
                  </Badge>
                </div>
                
                <CardHeader>
                  <CardTitle className="text-lg line-clamp-2">{story.title}</CardTitle>
                  <CardDescription className="text-xs">{story.date}</CardDescription>
                </CardHeader>
                
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {story.excerpt}
                  </p>
                  <Button variant="ghost" size="sm" className="w-full">
                    Read More →
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Email Signup CTA */}
      <section id="subscribe" className="py-16 bg-gradient-to-b from-primary/5 to-background">
        <div className="container">
          <Card className="max-w-2xl mx-auto shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl mb-2">Never Miss a Forecast</CardTitle>
              <CardDescription className="text-base">
                Get James's daily weather briefing and weekly cruise forecasts delivered to your inbox. 
                No spam, no hype—just the weather insights you need.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSignup} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1"
                    required
                  />
                  <Button type="submit" disabled={isSubmitting} className="sm:w-auto">
                    {isSubmitting ? "Subscribing..." : "Subscribe Free"}
                  </Button>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span className="text-primary">✓</span> Daily briefings
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-primary">✓</span> Cruise forecasts
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-primary">✓</span> Storm alerts
                  </div>
                </div>
              </form>
              <p className="text-xs text-muted-foreground text-center mt-4">
                Free forever. Unsubscribe anytime. Your email stays private.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 border-t">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h3 className="text-2xl font-bold">About James Van Fleet</h3>
            <div className="prose prose-lg mx-auto text-muted-foreground">
              <p>
                James Van Fleet is a professional meteorologist with 20 years of broadcast experience, 
                including serving as <strong className="text-foreground">chief meteorologist for Caribbean television</strong>. 
                He's forecasted hundreds of tropical systems, winter storms, and severe weather events across North America and the Caribbean.
              </p>
              <p>
                After being laid off twice as traditional TV weather declined, James created <strong className="text-foreground">WeatherStream</strong> to 
                bring his expertise directly to people who need clear, trustworthy weather information—especially travelers planning cruises 
                and vacations in weather-sensitive destinations.
              </p>
              <p className="text-sm">
                <strong className="text-foreground">No clickbait. No fear-mongering. Just honest forecasts from someone who's been doing this for two decades.</strong>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-card/30">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="text-sm font-semibold">WeatherStream</p>
              <p className="text-xs text-muted-foreground">Professional Weather Forecasts by James Van Fleet</p>
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
