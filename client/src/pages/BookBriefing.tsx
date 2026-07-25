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
import { useLanguage } from "@/contexts/LanguageContext";

export default function BookBriefing() {
  const [, setLocation] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { displayText, t } = useLanguage();

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
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: "51c4f3bf-d871-44ee-8d51-388f783c998a",
          subject: "New Briefing Request from " + form.name,
          name: form.name,
          title: form.title,
          email: form.email,
          phone: form.phone,
          vessel_name: form.vesselName,
          marina: form.marina,
          weather_concern: form.concern,
          preferred_date: form.preferredDate,
          preferred_time: form.preferredTime,
          platform: form.platform,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        toast.error(data?.message ?? displayText("Submission failed. Please try again."));
      }
    } catch {
      toast.error(displayText("Network error. Please check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#050d1a] flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-3xl font-black text-white">{displayText("Request Received")}</h2>
          <p className="text-white/70 text-lg leading-relaxed">
            {displayText("Thank you,")} <span className="text-white font-semibold">{form.name}</span>{displayText(". James will review your request and reach out to confirm your briefing time within 24 hours.")}
          </p>
          <p className="text-white/50 text-sm">
            {displayText("A confirmation will be sent to")} <span className="text-white/80">{form.email}</span>.
          </p>
          <Button
            onClick={() => setLocation("/")}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 border-0 mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {displayText("Back to Home")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-no-localize="true" className="min-h-screen bg-[#050d1a] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#050d1a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container py-4 flex items-center gap-4">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            {displayText("Back")}
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
            <span className="text-amber-300 text-sm font-semibold">{displayText("20-Minute Private Briefing")}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
            {displayText("Book Your Weather Briefing")}
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            {displayText("Direct, one-on-one weather decision support from James Van Fleet, former Chief Meteorologist of Royal Caribbean with 30+ years of experience.")}
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-8 items-start">
          {/* Pricing & Info Panel */}
          <div className="md:col-span-2 space-y-6">
            {/* Pricing Card */}
            <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 rounded-2xl p-6">
              <div className="text-center mb-4 space-y-3">
                {/* First briefing offer */}
                <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 rounded-full px-4 py-1.5">
                  <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">{displayText("Limited Offer")}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-white/50 text-xs uppercase tracking-widest">{displayText("First Briefing")}</p>
                  <p className="text-5xl font-black text-amber-400 leading-tight">$50</p>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <p className="text-white/40 text-xs uppercase tracking-widest mb-0.5">{displayText("Then")}</p>
                  <p className="text-white/80 text-xl font-bold">$150</p>
                  <p className="text-white/40 text-xs mt-0.5">{displayText("per 20-minute briefing")}</p>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">{displayText("Live Zoom, WebEx, Google Meet, or other platform -- your choice")}</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">{displayText("Vessel-specific forecast analysis for your route and marina")}</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">{displayText("Clear go/no-go guidance based on actual forecast data")}</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-sm">{displayText("The same decision support James provided for Royal Caribbean's fleet of captains and bridge officers, as well as the CEO, Chairman, and the entire C-suite of Royal Caribbean Group")}</p>
                </div>
              </div>
            </div>

            {/* What to Expect */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-white font-bold text-base">{displayText("What to Expect")}</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Video className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-white/60 text-sm">{displayText("James will confirm your booking by email within 24 hours and send a meeting link for your chosen platform.")}</p>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-white/60 text-sm">{displayText("Briefings are available for tropical weather, hurricane decisions, passage planning, and general marine weather concerns.")}</p>
                </div>
                <div className="flex items-start gap-3">
                  <Ship className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                  <p className="text-white/60 text-sm">{displayText("Limited availability. Slots are filled on a first-come, first-served basis.")}</p>
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
              <h2 className="text-xl font-bold text-white mb-2">{displayText("Your Details")}</h2>

              {/* Name + Title */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <User className="w-3.5 h-3.5" /> {displayText("Full Name")}
                  </label>
                  <Input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder={displayText("Captain Jane Smith")}
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Anchor className="w-3.5 h-3.5" /> {displayText("Title / Role")}
                  </label>
                  <Input
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    placeholder={displayText("Captain, Owner, First Mate...")}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
              </div>

              {/* Email + Phone */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" /> {displayText("Email Address")}
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
                    <Phone className="w-3.5 h-3.5" /> {displayText("Phone Number")}
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
                    <Ship className="w-3.5 h-3.5" /> {displayText("Vessel Name")}
                  </label>
                  <Input
                    name="vesselName"
                    value={form.vesselName}
                    onChange={handleChange}
                    placeholder={displayText("S/V Sea Breeze")}
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> {displayText("Marina / Current Location")}
                  </label>
                  <Input
                    name="marina"
                    value={form.marina}
                    onChange={handleChange}
                    placeholder={displayText("Marina del Rey, CA")}
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl h-11"
                  />
                </div>
              </div>

              {/* Weather Concern */}
              <div className="space-y-2">
                <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> {displayText("Weather Concern or Question")}
                </label>
                <Textarea
                  name="concern"
                  value={form.concern}
                  onChange={handleChange}
                  placeholder={displayText("Describe the weather situation or decision you need help with. For example: planning a passage from Miami to the Bahamas next week, concerned about a developing tropical system...")}
                  required
                  rows={4}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/40 rounded-xl resize-none"
                />
              </div>

              {/* Date + Time + Platform */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> {displayText("Preferred Date")}
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
                    <Clock className="w-3.5 h-3.5" /> {displayText("Preferred Time (EST)")}
                  </label>
                  <select
                    name="preferredTime"
                    value={form.preferredTime}
                    onChange={handleChange}
                    required
                    className="w-full bg-white/10 border border-white/20 text-white focus:border-white/40 rounded-xl h-11 px-3 text-sm appearance-none cursor-pointer [color-scheme:dark]"
                  >
                    <option value="" disabled className="bg-[#0d1f35] text-white/50">{displayText("Select a time...")}</option>
                    {Array.from({ length: 48 }, (_, i) => {
                      const totalMins = i * 15;
                      const hours24 = Math.floor(totalMins / 60);
                      const mins = totalMins % 60;
                      const ampm = hours24 < 12 ? "AM" : "PM";
                      const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
                      const label = `${hours12}:${mins.toString().padStart(2, "0")} ${ampm} EST`;
                      const value = `${hours24.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
                      return (
                        <option key={value} value={value} className="bg-[#0d1f35] text-white">
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-white/70 text-sm font-medium flex items-center gap-2">
                    <Video className="w-3.5 h-3.5" /> {displayText("Platform")}
                  </label>
                  <select
                    name="platform"
                    value={form.platform}
                    onChange={handleChange}
                    className="w-full h-11 bg-white/10 border border-white/20 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-white/40"
                  >
                    <option value="Zoom" className="bg-[#0a1628]">Zoom</option>
                    <option value="WebEx" className="bg-[#0a1628]">WebEx</option>
                    <option value="Google Meet" className="bg-[#0a1628]">Google Meet</option>
                    <option value="Other" className="bg-[#0a1628]">{displayText("Other")}</option>
                  </select>
                </div>
              </div>

              <p className="text-white/40 text-xs">
                {displayText("By submitting this form you agree to be contacted by James Van Fleet to confirm your briefing. Payment details will be provided upon confirmation.")}
              </p>

              <Button
                type="submit"
                disabled={isSubmitting}
                size="lg"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white border-0 shadow-xl text-base font-bold py-6 h-auto rounded-xl"
              >
                {isSubmitting ? (
                  t("bookBriefing.submitting")
                ) : (
                  <>
                    <Clock className="w-5 h-5 mr-2" />
                    {displayText("Request My Briefing")}
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
            {displayText("© 2026 VanFleet Wx. Weather Intelligence by James Van Fleet.")}
          </p>
        </div>
      </footer>
    </div>
  );
}
