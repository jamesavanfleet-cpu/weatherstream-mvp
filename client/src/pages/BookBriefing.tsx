import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Clock,
  Ship,
  Anchor,
  CheckCircle,
  ArrowLeft,
  Phone,
  Mail,
  User,
  MapPin,
  AlertTriangle,
  Calendar,
  Video,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function BookBriefing() {
  const [, setLocation] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    vesselName: "",
    marina: "",
    concern: "",
    preferredDate: "",
    preferredTime: "",
    platform: "Zoom",
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate submission delay
    await new Promise((r) => setTimeout(r, 1200));
    setIsSubmitting(false);
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#050d1a] flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-3xl font-black text-white">Request Received</h2>
          <p className="text-white/70 text-lg leading-relaxed">
            Thank you, <span className="text-white font-semibold">{form.name}</span>. James will review your request and reach out to confirm your briefing time within 24 hours.
          </p>
          <p className="text-white/50 text-sm">
            A confirmation will be sent to <span className="text-white/80">{form.email}</span>.
          </p>
          <Button
            onClick={() => setLocation("/")}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 border-0 mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050d1a] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#050d1a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container py-4 flex items-center gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2 ml-2">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg overflow-hidden">
              <img
                src="https://files.manuscdn.com/user_upload_by_module/session_file/110462184/vIcLAlFQYCjrGjIM.png"
                alt="VanFleet Wx"
                className="w-8 h-8 object-contain"
              />
            </div>
            <span className="text-white font-bold text-sm">VanFleet Wx</span>
          </div>
        </div>
      </div>

      <div className="container py-12 max-w-5xl mx-auto px-4">
        {/* Page Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-500/30 px-4 py-2 rounded-full mb-6">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300 text-sm font-semibold">20-Minute Private Briefing</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
            Book Your Weather Briefing
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Direct, one-on-one weather decision support from James Van Fleet, former Chief Meteorologist of Royal Caribbean with 30+ years of experience.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-8 items-start">
          {/* Pricing & Info Panel */}
          <div className="md:col-span-2 space-y-6">
            {/* Pricing Card */}
            <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-2xl p-6">
              <div className="text-center mb-4">
                <p className="text-amber-400 text-sm font-semibold tracking-wide mb-2">First briefing is free</p>
                <p className="text-white/60 text-sm uppercase tracking-widest mb-1">Briefing Fee</p>
                <p className="text-3xl font-bold text-white">$150</p>
                <p className="text-white/50 text-sm mt-1">per 20-minute session</p>
              </div>
              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">Live Zoom or WebEx call with James directly</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">Vessel-specific forecast analysis for your route and marina</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">Clear go/no-go guidance based on actual forecast data</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">The same decision support James provided for Royal Caribbean's fleet of captains and bridge officers, as well as the CEO, Chairman, and the entire C-suite of Royal Caribbean Group</p>
                </div>
              </div>
            </div>

            {/* What to Expect */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-white font-bold text-base">What to Expect</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Video className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-white/60 text-sm">James will confirm your booking by email within 24 hours and send a meeting link for your chosen platform.</p>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/60 text-sm">Briefings are available for tropical weather, hurricane decisions, passage planning, and general marine weather concerns.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Ship className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                  <p className="text-white/60 text-sm">Limited availability. Slots are filled on a first-come, first-served basis.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Booking Form */}
          <div className="md:col-span-3">
            <form
              onSubmit={handleSubmit}
              className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6"
            >
              <h2 className="text-xl font-bold text-white mb-2">Your Details</h2>

              {/* Name + Title */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <User className="w-3.5 h-3.5" /> Full Name
                  </label>
                  <Input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Captain Jane Smith"
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Anchor className="w-3.5 h-3.5" /> Title / Role
                  </label>
                  <Input
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    placeholder="Captain, Owner, First Mate..."
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
              </div>

              {/* Email + Phone */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" /> Email Address
                  </label>
                  <Input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" /> Phone Number
                  </label>
                  <Input
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 000-0000"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
              </div>

              {/* Vessel + Marina */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Ship className="w-3.5 h-3.5" /> Vessel Name
                  </label>
                  <Input
                    name="vesselName"
                    value={form.vesselName}
                    onChange={handleChange}
                    placeholder="S/V Sea Breeze"
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> Marina / Current Location
                  </label>
                  <Input
                    name="marina"
                    value={form.marina}
                    onChange={handleChange}
                    placeholder="Marina del Rey, CA"
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
              </div>

              {/* Weather Concern */}
              <div className="space-y-2">
                <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> Weather Concern or Question
                </label>
                <Textarea
                  name="concern"
                  value={form.concern}
                  onChange={handleChange}
                  placeholder="Describe the weather situation or decision you need help with. For example: planning a passage from Miami to the Bahamas next week, concerned about a developing tropical system..."
                  required
                  rows={4}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl resize-none"
                />
              </div>

              {/* Date + Time + Platform */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> Preferred Date
                  </label>
                  <Input
                    name="preferredDate"
                    type="date"
                    value={form.preferredDate}
                    onChange={handleChange}
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11 [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Preferred Time (EST)
                  </label>
                  <Input
                    name="preferredTime"
                    type="time"
                    value={form.preferredTime}
                    onChange={handleChange}
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11 [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Video className="w-3.5 h-3.5" /> Platform
                  </label>
                  <select
                    name="platform"
                    value={form.platform}
                    onChange={handleChange}
                    className="w-full h-11 bg-white/10 border border-white/20 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-white/40"
                  >
                    <option value="Zoom" className="bg-[#0a1628]">Zoom</option>
                    <option value="WebEx" className="bg-[#0a1628]">WebEx</option>
                  </select>
                </div>
              </div>

              <p className="text-white/40 text-xs">
                By submitting this form you agree to be contacted by James Van Fleet to confirm your briefing. Payment details will be provided upon confirmation.
              </p>

              <Button
                type="submit"
                disabled={isSubmitting}
                size="lg"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white border-0 shadow-xl text-base font-bold py-6 h-auto rounded-xl"
              >
                {isSubmitting ? (
                  "Submitting..."
                ) : (
                  <>
                    <Clock className="w-5 h-5 mr-2" />
                    Request My Briefing
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-12">
        <div className="container text-center">
          <p className="text-white/30 text-xs">
            © 2026 VanFleet Wx. Weather Intelligence by James Van Fleet.
          </p>
        </div>
      </footer>
    </div>
  );
}
