'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { FeedItem, FeedResponse } from '@/lib/types';

// ─── Config (overrideable via env vars baked at build time) ───────────────────
const POLL_MS = 600000; // 10 minutes
const SLIDE_MS = parseInt(process.env.NEXT_PUBLIC_SLIDE_MS || '8000');
const NEW_BURST_MS = parseInt(process.env.NEXT_PUBLIC_NEW_BURST_MS || '15000');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function caption(item: FeedItem): string {
  return item.commentText || item.description || '';
}

function displayDate(item: FeedItem): string {
  return fmtDate(item.takenAt || item.createdAt);
}

// ─── Card component ───────────────────────────────────────────────────────────

function PhotoCard({ item, isActive }: { item: FeedItem; isActive: boolean }) {
  const cap = caption(item);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        background: '#0d0d0d',
        flexShrink: 0,
      }}
    >
      {/* Background blur image for atmosphere */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${item.imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(32px) brightness(0.18) saturate(0.5)',
          transform: 'scale(1.1)',
          zIndex: 0,
        }}
      />

      {/* Gradient overlays */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(13,13,13,0.85) 0%, transparent 25%, transparent 60%, rgba(13,13,13,0.97) 100%)',
          zIndex: 1,
        }}
      />

      {/* Top red accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #851e20, #b84042, #851e20)',
          zIndex: 10,
        }}
      />

      {/* Header */}
      <div
        style={{
          position: 'relative',
          zIndex: 5,
          padding: '28px 48px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {/* Project name */}
        <div
          style={{
            fontSize: 'clamp(28px, 4.5vw, 64px)',
            fontWeight: 700,
            fontFamily: "'Georgia', serif",
            color: '#ffffff',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            textShadow: '0 2px 20px rgba(0,0,0,0.8)',
            maxWidth: '80%',
          }}
        >
          {item.projectName}
        </div>

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            gap: '24px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginTop: '4px',
          }}
        >
          {/* Date chip */}
          <MetaChip icon="📅" label="Taken" value={displayDate(item)} />
          {item.uploaderName && <MetaChip icon="👤" label="By" value={item.uploaderName} />}
          {item.locationName && <MetaChip icon="📍" label="" value={item.locationName} />}
        </div>
      </div>

      {/* Main image */}
      <div
        style={{
          position: 'relative',
          zIndex: 5,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 48px',
          minHeight: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt={cap || item.projectName}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: '6px',
            boxShadow: '0 8px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)',
            opacity: isActive ? 1 : 0.7,
            transition: 'opacity 0.6s ease',
          }}
        />
      </div>

      {/* Caption / Footer */}
      <div
        style={{
          position: 'relative',
          zIndex: 5,
          padding: '16px 48px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {cap && (
          <div
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: '3px',
                background: '#851e20',
                borderRadius: '2px',
                alignSelf: 'stretch',
                flexShrink: 0,
                marginTop: '2px',
              }}
            />
            <p
              style={{
                fontSize: 'clamp(14px, 2vw, 26px)',
                color: '#e8e8e8',
                lineHeight: 1.45,
                fontStyle: 'italic',
                maxWidth: '80%',
                textShadow: '0 1px 8px rgba(0,0,0,0.9)',
              }}
            >
              {cap}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '100px',
        padding: '4px 14px',
        fontSize: 'clamp(11px, 1.2vw, 17px)',
        color: '#c8c8c8',
        backdropFilter: 'blur(8px)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '0.9em' }}>{icon}</span>
      {label && <span style={{ color: '#878787' }}>{label}:</span>}
      <span>{value}</span>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '3px',
        background: 'rgba(255,255,255,0.08)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: 'linear-gradient(90deg, #851e20, #b84042)',
          transition: 'width 0.1s linear',
        }}
      />
    </div>
  );
}

// ─── Dot indicator ────────────────────────────────────────────────────────────

function DotNav({ total, current }: { total: number; current: number }) {
  const MAX_DOTS = 20;
  if (total <= 1) return null;

  const shown = Math.min(total, MAX_DOTS);
  const offset = total > MAX_DOTS ? Math.max(0, Math.min(current - Math.floor(MAX_DOTS / 2), total - MAX_DOTS)) : 0;

  return (
    <div
      style={{
        position: 'fixed',
        right: '24px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        zIndex: 100,
      }}
    >
      {Array.from({ length: shown }, (_, i) => {
        const idx = i + offset;
        const isActive = idx === current;
        return (
          <div
            key={idx}
            style={{
              width: isActive ? '8px' : '5px',
              height: isActive ? '8px' : '5px',
              borderRadius: '50%',
              background: isActive ? '#b84042' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.3s ease',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── "NEW" badge ──────────────────────────────────────────────────────────────

function NewBadge() {
  return (
    <div
      style={{
        position: 'fixed',
        top: '24px',
        right: '48px',
        background: '#851e20',
        color: 'white',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '2px',
        padding: '6px 16px',
        borderRadius: '4px',
        zIndex: 200,
        animation: 'pulse 1s ease-in-out infinite alternate',
      }}
    >
      NEW PHOTOS
      <style>{`@keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }`}</style>
    </div>
  );
}

// ─── Counter badge ────────────────────────────────────────────────────────────

function Counter({ current, total }: { current: number; total: number }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '48px',
        fontSize: '13px',
        color: '#878787',
        fontFamily: "'Courier New', monospace",
        zIndex: 100,
        letterSpacing: '1px',
      }}
    >
      {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showNewBadge, setShowNewBadge] = useState(false);

  const itemsRef = useRef<FeedItem[]>([]);
  const currentRef = useRef(0);
  const burstRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressStartRef = useRef<number>(Date.now());

  // Keep refs in sync
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { currentRef.current = current; }, [current]);

  // ── Progress ticker ──────────────────────────────────────────────────────────
  const startProgress = useCallback(() => {
    if (progressRef.current) clearInterval(progressRef.current);
    progressStartRef.current = Date.now();
    setProgress(0);
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - progressStartRef.current;
      setProgress(Math.min(elapsed / SLIDE_MS, 1));
    }, 50);
  }, []);

  // ── Advance to next card ─────────────────────────────────────────────────────
  const advance = useCallback(() => {
    const len = itemsRef.current.length;
    if (len === 0) return;
    setCurrent((c) => (c + 1) % len);
    startProgress();
  }, [startProgress]);

  // ── Start/restart auto-scroll ────────────────────────────────────────────────
  const startSlider = useCallback(() => {
    if (slideRef.current) clearInterval(slideRef.current);
    startProgress();
    slideRef.current = setInterval(advance, SLIDE_MS);
  }, [advance, startProgress]);

  // ── Fetch feed ───────────────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/feed');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      const data: FeedResponse = await res.json();
      setError(null);

      const incoming = data.data;
      if (incoming.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const oldIds = new Set(itemsRef.current.map((i) => i.id));
      const newOnes = incoming.filter((i) => !oldIds.has(i.id));

      if (newOnes.length > 0 && itemsRef.current.length > 0) {
        // New photos detected — jump to index 0 briefly, then return
        const savedIndex = currentRef.current + newOnes.length; // adjust for inserted items

        setItems(incoming);
        setCurrent(0);
        startProgress();
        setShowNewBadge(true);

        if (burstRef.current) clearTimeout(burstRef.current);
        burstRef.current = setTimeout(() => {
          setShowNewBadge(false);
          setCurrent(Math.min(savedIndex, incoming.length - 1));
          startProgress();
        }, NEW_BURST_MS);
      } else {
        setItems(incoming);
        // Keep current index valid
        if (currentRef.current >= incoming.length) {
          setCurrent(0);
        }
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [startProgress]);

  // ── Mount: initial fetch + start slider + poll ───────────────────────────────
  useEffect(() => {
    fetchFeed().then(() => startSlider());

    const pollInterval = setInterval(fetchFeed, POLL_MS);

    return () => {
      clearInterval(pollInterval);
      if (slideRef.current) clearInterval(slideRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      if (burstRef.current) clearTimeout(burstRef.current);
    };
  }, [fetchFeed, startSlider]);

  // ── Restart slider when items update ─────────────────────────────────────────
  useEffect(() => {
    if (items.length > 0) startSlider();
  }, [items.length, startSlider]);

  // ─── Render states ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '24px', background: '#0d0d0d' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#851e20',
                animation: `bounce 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
              }}
            />
          ))}
        </div>
        <style>{`@keyframes bounce { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-12px); opacity: 0.3; } }`}</style>
        <p style={{ color: '#878787', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '2px' }}>LOADING FEED</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px', background: '#0d0d0d', padding: '40px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid #851e20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: '#851e20' }}>!</div>
        <p style={{ color: '#f7ecec', fontSize: '20px', fontWeight: 600 }}>Error Loading Feed</p>
        <p style={{ color: '#878787', fontSize: '14px', fontFamily: 'monospace', textAlign: 'center', maxWidth: '600px' }}>{error}</p>
        <p style={{ color: '#555', fontSize: '12px', fontFamily: 'monospace' }}>Retrying automatically…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px', background: '#0d0d0d' }}>
        <p style={{ color: '#878787', fontSize: '24px' }}>No images found in the last {process.env.NEXT_PUBLIC_DAYS_BACK || '14'} days.</p>
        <p style={{ color: '#555', fontSize: '14px', fontFamily: 'monospace' }}>Checking again every {POLL_MS / 1000}s…</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0d0d0d', position: 'relative' }}>

      {/* Slide container */}
      <div
        style={{
          display: 'flex',
          width: `${items.length * 100}vw`,
          height: '100vh',
          transform: `translateX(-${current * 100}vw)`,
          transition: 'transform 0.7s cubic-bezier(0.77, 0, 0.175, 1)',
        }}
      >
        {items.map((item, i) => (
          <PhotoCard key={item.id} item={item} isActive={i === current} />
        ))}
      </div>

      {/* Overlays */}
      {showNewBadge && <NewBadge />}
      <ProgressBar progress={progress} />
      <DotNav total={items.length} current={current} />
      <Counter current={current} total={items.length} />

      {/* Branding mark */}
      <div
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '48px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 100,
        }}
      >
        <div style={{ width: '16px', height: '16px', background: '#851e20', borderRadius: '2px' }} />
        <span style={{ color: '#3a3a3a', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '2px', textTransform: 'uppercase' }}>
          InstaProcore
        </span>
      </div>
    </div>
  );
}
