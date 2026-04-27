// FromTheDeck.tsx
// Community photo gallery page for mycruisingweather.com
// Masonry grid layout, lightbox expand, submit prompts top and bottom
// Dark navy styling consistent with the rest of the site
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Camera, X, ChevronLeft, ChevronRight, Mail } from "lucide-react";

const SUBMIT_EMAIL = "jamesavanfleet@gmail.com";

const SUBMIT_SUBJECT = "From the Deck -- Photo Submission";
const SUBMIT_BODY = `Hi James,%0A%0AI'd like to submit a photo for the From the Deck gallery.%0A%0AShip Name:%0ACruise Line:%0ALocation (port, region, or at sea):%0ADate Photo Taken:%0APhotographer Name:%0AEmail Address:%0AOptional Caption:%0A%0APhoto attached.`;

interface GalleryPhoto {
  id: number;
  src: string;
  ship: string;
  line: string;
  location: string;
  caption?: string;
}

const PHOTOS: GalleryPhoto[] = [
  { id: 15, src: "/from-the-deck/ftd-15.jpg", ship: "Ovation of the Seas", line: "Royal Caribbean", location: "Alaska (Glacier)" },
  { id: 18, src: "/from-the-deck/ftd-18.jpg", ship: "Oasis of the Seas", line: "Royal Caribbean", location: "Bahamas", caption: "Golden hour at sea" },
  { id: 12, src: "/from-the-deck/ftd-12.jpg", ship: "Wonder of the Seas", line: "Royal Caribbean", location: "Labadee, Haiti" },
  { id: 16, src: "/from-the-deck/ftd-16.jpg", ship: "Odyssey of the Seas", line: "Royal Caribbean", location: "Haifa, Israel" },
  { id: 8,  src: "/from-the-deck/ftd-08.jpg", ship: "Ovation of the Seas", line: "Royal Caribbean", location: "Dawes Glacier, Alaska" },
  { id: 11, src: "/from-the-deck/ftd-11.jpg", ship: "Allure of the Seas", line: "Royal Caribbean", location: "St. Kitts, Caribbean" },
  { id: 4,  src: "/from-the-deck/ftd-04.jpg", ship: "Independence of the Seas", line: "Royal Caribbean", location: "CocoCay, Bahamas" },
  { id: 13, src: "/from-the-deck/ftd-13.jpg", ship: "Odyssey of the Seas", line: "Royal Caribbean", location: "Port Everglades, Fort Lauderdale, FL" },
  { id: 9,  src: "/from-the-deck/ftd-09.jpg", ship: "Radiance of the Seas", line: "Royal Caribbean", location: "Juneau, Alaska" },
  { id: 5,  src: "/from-the-deck/ftd-05.jpg", ship: "At Sea", line: "", location: "At Sea (unknown location)", caption: "Sunset at Sea" },
  { id: 14, src: "/from-the-deck/ftd-14.jpg", ship: "Liberty of the Seas", line: "Royal Caribbean", location: "Dry Dock" },
  { id: 17, src: "/from-the-deck/ftd-17.jpg", ship: "Harmony of the Seas", line: "Royal Caribbean", location: "Dry Dock" },
  { id: 1,  src: "/from-the-deck/ftd-01.jpg", ship: "Navigator of the Seas", line: "Royal Caribbean", location: "Cabo San Lucas, Mexico" },
  { id: 2,  src: "/from-the-deck/ftd-02.jpg", ship: "Wonder of the Seas", line: "Royal Caribbean", location: "Cozumel, Mexico" },
  { id: 3,  src: "/from-the-deck/ftd-03.jpg", ship: "Symphony of the Seas", line: "Royal Caribbean", location: "Cozumel, Mexico" },
  { id: 6,  src: "/from-the-deck/ftd-06.jpg", ship: "Enchantment of the Seas", line: "Royal Caribbean", location: "Sea Day, Southern Caribbean" },
  { id: 7,  src: "/from-the-deck/ftd-07.jpg", ship: "Anthem of the Seas", line: "Royal Caribbean", location: "Bonaire, Caribbean" },
  { id: 10, src: "/from-the-deck/ftd-10.jpg", ship: "Explorer of the Seas", line: "Royal Caribbean", location: "Bonaire, Caribbean" },
  { id: 19, src: "/from-the-deck/ftd-19.jpg", ship: "Freedom of the Seas", line: "Royal Caribbean", location: "Grand Cayman" },
  { id: 20, src: "/from-the-deck/ftd-20.jpg", ship: "Vision of the Seas", line: "Royal Caribbean", location: "Sea Day, North of Puerto Rico" },
  { id: 21, src: "/from-the-deck/ftd-21.jpg", ship: "Vision of the Seas", line: "Royal Caribbean", location: "Bridge Wing, at Sea" },
  { id: 22, src: "/from-the-deck/ftd-22.jpg", ship: "Explorer of the Seas", line: "Royal Caribbean", location: "Aruba" },
];

function SubmitBanner({ compact = false }: { compact?: boolean }) {
  const mailtoHref = `mailto:${SUBMIT_EMAIL}?subject=${encodeURIComponent(SUBMIT_SUBJECT)}&body=${SUBMIT_BODY}`;
  return (
    <div
      style={{
        background: compact ? "rgba(13,21,32,0.7)" : "rgba(13,21,32,0.9)",
        border: "1px solid rgba(245,158,11,0.3)",
        borderRadius: compact ? 12 : 16,
        padding: compact ? "14px 20px" : "24px 28px",
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: compact ? "center" : "flex-start",
        gap: compact ? 16 : 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? "1rem" : "1.15rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.04em" }}>
          Submit Your Photo
        </div>
        <div style={{ fontSize: "0.85rem", color: "#7B9BB5", marginTop: 3 }}>
          Your weather photos at sea, in port, and around the ship
        </div>
      </div>
      <a
        href={mailtoHref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          color: "#0D1520",
          fontWeight: 700,
          fontSize: "0.9rem",
          letterSpacing: "0.06em",
          padding: "10px 22px",
          borderRadius: 8,
          textDecoration: "none",
          whiteSpace: "nowrap",
          flexShrink: 0,
          boxShadow: "0 2px 12px rgba(245,158,11,0.35)",
          transition: "opacity 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        <Mail size={15} />
        Send Us Your Photo
      </a>
    </div>
  );
}

export default function FromTheDeck() {
  const [, navigate] = useLocation();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const openLightbox = (idx: number) => setLightboxIdx(idx);
  const closeLightbox = () => setLightboxIdx(null);

  const goPrev = useCallback(() => {
    setLightboxIdx(prev => (prev === null ? null : (prev - 1 + PHOTOS.length) % PHOTOS.length));
  }, []);

  const goNext = useCallback(() => {
    setLightboxIdx(prev => (prev === null ? null : (prev + 1) % PHOTOS.length));
  }, []);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIdx, goPrev, goNext]);

  const activePh = lightboxIdx !== null ? PHOTOS[lightboxIdx] : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0A0C18", fontFamily: "inherit" }}>
      {/* Top nav bar */}
      <div style={{
        background: "#0D1520",
        borderBottom: "1px solid #1A2D42",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "1px solid #1A2D42",
            color: "#7B9BB5",
            cursor: "pointer",
            fontSize: "1rem",
            letterSpacing: "0.08em",
            padding: "6px 14px",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M7 1L3 5l4 4" stroke="#7B9BB5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          HOME
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#E8F4FF", letterSpacing: "0.08em" }}>
            FROM THE DECK
          </div>
          <div style={{ fontSize: "0.85rem", color: "#7B9BB5", marginTop: 2 }}>
            Your weather photos at sea, in port, and around the ship
          </div>
        </div>
        {/* Nav Intel button */}
        <a
          href={`mailto:${SUBMIT_EMAIL}?subject=${encodeURIComponent(SUBMIT_SUBJECT)}&body=${SUBMIT_BODY}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            color: "#0D1520",
            fontWeight: 700,
            fontSize: "0.8rem",
            letterSpacing: "0.06em",
            padding: "7px 16px",
            borderRadius: 6,
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
            boxShadow: "0 2px 10px rgba(245,158,11,0.3)",
          }}
        >
          <Camera size={13} />
          Submit Your Photo
        </a>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 16px 60px" }}>
        {/* Top submit banner */}
        <div style={{ marginBottom: 32 }}>
          <SubmitBanner />
        </div>

        {/* Masonry grid */}
        <div style={{
          columns: "3 280px",
          columnGap: 16,
        }}>
          {PHOTOS.map((photo, idx) => (
            <div
              key={photo.id}
              onClick={() => openLightbox(idx)}
              style={{
                breakInside: "avoid",
                marginBottom: 16,
                borderRadius: 10,
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
                border: "1px solid rgba(255,255,255,0.07)",
                background: "#0D1520",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = "scale(1.015)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.5)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
            >
              <img
                src={photo.src}
                alt={`${photo.ship} - ${photo.location}`}
                loading="lazy"
                style={{ width: "100%", display: "block", objectFit: "cover" }}
              />
              {/* Caption overlay */}
              <div style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "linear-gradient(to top, rgba(10,12,24,0.92) 0%, rgba(10,12,24,0.6) 60%, transparent 100%)",
                padding: "28px 12px 10px",
              }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#E8F4FF", lineHeight: 1.3 }}>
                  {photo.ship}
                </div>
                {photo.line && (
                  <div style={{ fontSize: "0.72rem", color: "#7B9BB5", marginTop: 1 }}>{photo.line}</div>
                )}
                <div style={{ fontSize: "0.72rem", color: "#00D4FF", marginTop: 2 }}>{photo.location}</div>
                {photo.caption && (
                  <div style={{ fontSize: "0.7rem", color: "#a0b4c8", marginTop: 2, fontStyle: "italic" }}>{photo.caption}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom submit banner */}
        <div style={{ marginTop: 40 }}>
          <SubmitBanner compact />
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && activePh && (
        <div
          onClick={closeLightbox}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,7,15,0.96)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Close */}
          <button
            onClick={closeLightbox}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#E8F4FF",
              zIndex: 10,
            }}
          >
            <X size={20} />
          </button>

          {/* Prev */}
          <button
            onClick={e => { e.stopPropagation(); goPrev(); }}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: "50%",
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#E8F4FF",
              zIndex: 10,
            }}
          >
            <ChevronLeft size={24} />
          </button>

          {/* Next */}
          <button
            onClick={e => { e.stopPropagation(); goNext(); }}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: "50%",
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#E8F4FF",
              zIndex: 10,
            }}
          >
            <ChevronRight size={24} />
          </button>

          {/* Image + caption */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: "min(92vw, 1100px)",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0,
            }}
          >
            <div style={{ position: "relative", width: "100%" }}>
              <img
                src={activePh.src}
                alt={`${activePh.ship} - ${activePh.location}`}
                style={{
                  maxWidth: "100%",
                  maxHeight: "80vh",
                  objectFit: "contain",
                  display: "block",
                  borderRadius: "10px 10px 0 0",
                }}
              />
            </div>
            {/* Caption bar below image */}
            <div style={{
              width: "100%",
              background: "rgba(13,21,32,0.97)",
              borderRadius: "0 0 10px 10px",
              padding: "12px 18px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#E8F4FF" }}>{activePh.ship}</div>
              <div style={{ display: "flex", gap: 16, marginTop: 3, flexWrap: "wrap" }}>
                {activePh.line && (
                  <span style={{ fontSize: "0.82rem", color: "#7B9BB5" }}>{activePh.line}</span>
                )}
                <span style={{ fontSize: "0.82rem", color: "#00D4FF" }}>{activePh.location}</span>
                {activePh.caption && (
                  <span style={{ fontSize: "0.82rem", color: "#a0b4c8", fontStyle: "italic" }}>{activePh.caption}</span>
                )}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3a5060", marginTop: 6 }}>
                {lightboxIdx + 1} of {PHOTOS.length} &nbsp;|&nbsp; Use arrow keys or buttons to navigate &nbsp;|&nbsp; Press Esc to close
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
