import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Cloud, ExternalLink, Star, Users, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * WeatherStream MVP - Zero-to-One Launch
 * 
 * Design Philosophy: Clean, Trustworthy, Professional
 * - Deep blue primary (trust & authority)
 * - Ample whitespace (clarity)
 * - Subtle shadows (depth without distraction)
 * - Clear hierarchy (James's expertise first, streamers second)
 */

// Sample data - James will replace with real streamers
const FEATURED_PICK = {
  name: "Ryan Hall, Y'all",
  channel: "https://youtube.com/@RyanHallYall",
  specialty: "Severe Weather",
  subscribers: "3M+",
  description: "Excellent coverage of the developing winter storm in the Midwest with detailed model analysis and real-time updates.",
  reason: "Ryan's calm, data-driven approach makes complex weather accessible. His live streams during severe events are must-watch.",
  thumbnail: "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=400&h=300&fit=crop"
};

const STREAMERS = [
  {
    name: "Ryan Hall, Y'all",
    channel: "https://youtube.com/@RyanHallYall",
    specialty: "Severe Weather",
    subscribers: "3M+",
    verified: true,
    thumbnail: "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=300&h=200&fit=crop"
  },
  {
    name: "Max Velocity",
    channel: "https://youtube.com/@MaxVelocityWX",
    specialty: "Severe Weather",
    subscribers: "1.66M",
    verified: true,
    thumbnail: "https://images.unsplash.com/photo-1601134467661-3d775b999c8b?w=300&h=200&fit=crop"
  },
  {
    name: "Reed Timmer",
    channel: "https://youtube.com/@ReedTimmerWx",
    specialty: "Storm Chasing",
    subscribers: "1.5M",
    verified: true,
    thumbnail: "https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?w=300&h=200&fit=crop"
  },
  {
    name: "Pecos Hank",
    channel: "https://youtube.com/@PecosHank",
    specialty: "Storm Chasing",
    subscribers: "1.2M",
    verified: true,
    thumbnail: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=300&h=200&fit=crop"
  },
  {
    name: "Live Storms Media",
    channel: "https://youtube.com/@LiveStormsMedia",
    specialty: "Severe Weather",
    subscribers: "401K",
    verified: false,
    thumbnail: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=300&h=200&fit=crop"
  },
  {
    name: "Texas Storm Chasers",
    channel: "https://youtube.com/@TexasStormChasers",
    specialty: "Regional Coverage",
    subscribers: "234K",
    verified: false,
    thumbnail: "https://images.unsplash.com/photo-1513002749550-c59d786b8e6c?w=300&h=200&fit=crop"
  },
  {
    name: "Skip Talbot",
    channel: "https://youtube.com/@SkipTalbot",
    specialty: "Storm Chasing",
    subscribers: "86K",
    verified: false,
    thumbnail: "https://images.unsplash.com/photo-1603575448878-868a20723f5d?w=300&h=200&fit=crop"
  },
  {
    name: "Basehunters Chasing",
    channel: "https://youtube.com/@BasehuntersChasing",
    specialty: "Meteorology",
    subscribers: "82K",
    verified: false,
    thumbnail: "https://images.unsplash.com/photo-1558486012-817176f84c6d?w=300&h=200&fit=crop"
  }
];

const CATEGORIES = ["All", "Hurricanes", "Tornadoes", "Winter", "Regional"];

export default function Home() {
  const [email, setEmail] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    setIsSubmitting(true);
    // Simulate API call - in real version, this would go to Mailchimp/ConvertKit
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success("Thanks for signing up! Check your inbox for James's first weather pick.");
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
              <p className="text-xs text-muted-foreground">Curated by James Van Fleet</p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" asChild>
            <a href="#signup">Get Daily Picks</a>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-16 md:py-24">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="mb-2">
              <Star className="w-3 h-3 mr-1" />
              Curated by a 20-Year Veteran Meteorologist
            </Badge>
            
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Discover the Best Weather Streamers, <span className="text-primary">Handpicked by an Expert</span>
            </h2>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              James Van Fleet, former Caribbean chief meteorologist with 20 years of broadcast experience, 
              curates the most credible and engaging weather content creators so you don't have to search.
            </p>
            
            <div className="flex flex-wrap gap-6 justify-center pt-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">Verified Experts</p>
                  <p className="text-xs text-muted-foreground">Degreed meteorologists</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold">Live Coverage</p>
                  <p className="text-xs text-muted-foreground">Real-time weather events</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* James's Pick of the Day */}
      <section className="py-12 bg-card/30">
        <div className="container">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <Star className="w-6 h-6 text-primary fill-primary" />
              <h3 className="text-2xl font-bold">James's Pick of the Day</h3>
            </div>
            
            <Card className="overflow-hidden shadow-lg border-2 border-primary/20">
              <div className="md:flex">
                <div className="md:w-2/5">
                  <img 
                    src={FEATURED_PICK.thumbnail} 
                    alt={FEATURED_PICK.name}
                    className="w-full h-64 md:h-full object-cover"
                  />
                </div>
                <div className="md:w-3/5">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-2xl mb-2">{FEATURED_PICK.name}</CardTitle>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="secondary">{FEATURED_PICK.specialty}</Badge>
                          <Badge variant="outline">{FEATURED_PICK.subscribers} subscribers</Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Today's Coverage:</p>
                      <p className="text-foreground">{FEATURED_PICK.description}</p>
                    </div>
                    
                    <div className="bg-primary/5 p-4 rounded-lg border-l-4 border-primary">
                      <p className="text-sm font-semibold text-primary mb-1">Why James Recommends:</p>
                      <p className="text-sm text-foreground">{FEATURED_PICK.reason}</p>
                    </div>
                    
                    <Button className="w-full sm:w-auto" asChild>
                      <a href={FEATURED_PICK.channel} target="_blank" rel="noopener noreferrer">
                        Watch on YouTube <ExternalLink className="w-4 h-4 ml-2" />
                      </a>
                    </Button>
                  </CardContent>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Streamer Directory */}
      <section className="py-16">
        <div className="container">
          <div className="mb-8">
            <h3 className="text-3xl font-bold mb-2">Curated Weather Streamers</h3>
            <p className="text-muted-foreground">Browse by specialty to find the coverage you need</p>
          </div>
          
          {/* Category Filters */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {CATEGORIES.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="whitespace-nowrap"
              >
                {category}
              </Button>
            ))}
          </div>
          
          {/* Streamer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {STREAMERS.map((streamer) => (
              <Card key={streamer.name} className="overflow-hidden hover:shadow-lg transition-shadow group">
                <div className="relative">
                  <img 
                    src={streamer.thumbnail} 
                    alt={streamer.name}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {streamer.verified && (
                    <Badge className="absolute top-2 right-2 bg-primary">
                      <Star className="w-3 h-3 mr-1 fill-current" />
                      Van Fleet Verified
                    </Badge>
                  )}
                </div>
                
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{streamer.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{streamer.specialty}</Badge>
                    <span className="text-xs">{streamer.subscribers} subs</span>
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a href={streamer.channel} target="_blank" rel="noopener noreferrer">
                      View Channel <ExternalLink className="w-3 h-3 ml-2" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Email Signup CTA */}
      <section id="signup" className="py-16 bg-gradient-to-b from-primary/5 to-background">
        <div className="container">
          <Card className="max-w-2xl mx-auto shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl mb-2">Get James's Daily Weather Picks</CardTitle>
              <CardDescription className="text-base">
                Every morning, James selects the best live coverage and explains why it's worth watching. 
                Join 500+ weather enthusiasts who trust his expertise.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSignup} className="flex flex-col sm:flex-row gap-3">
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
              </form>
              <p className="text-xs text-muted-foreground text-center mt-4">
                No spam. Unsubscribe anytime. Your email stays private.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* About Section */}
      <section className="py-16 border-t">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h3 className="text-2xl font-bold">About WeatherStream</h3>
            <div className="prose prose-lg mx-auto text-muted-foreground">
              <p>
                <strong className="text-foreground">WeatherStream</strong> was created by <strong className="text-foreground">James Van Fleet</strong>, 
                a meteorologist with 20 years of broadcast experience, including serving as chief meteorologist for Caribbean television. 
                After being laid off twice as traditional TV weather declined, James recognized a critical need in the digital weather space.
              </p>
              <p>
                While millions now watch weather content on YouTube, there's no trusted guide to help people find credible sources. 
                James curates the best streamers—from degreed meteorologists to experienced storm chasers—so you can trust what you're watching 
                when severe weather strikes.
              </p>
              <p className="text-sm">
                This is a zero-to-one MVP. Features like embedded video players, multi-stream viewing, and AI recommendations are coming soon. 
                For now, James is focused on one thing: helping you find the best weather coverage, every single day.
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
              <p className="text-xs text-muted-foreground">Curated by James Van Fleet</p>
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
