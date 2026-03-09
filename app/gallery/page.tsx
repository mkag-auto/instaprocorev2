'use client';

import { useEffect, useState, useCallback } from 'react';
import type { FeedItem, FeedResponse } from '@/lib/types';

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ item, onClose, onPrev, onNext }: {
  item: FeedItem;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const cap = item.commentText || item.description;

  function fmt(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', flexDirection: 'row', gap: '0',
          background: '#141414', borderRadius: '10px',
          border: '1px solid #2a2a2a',
          overflow: 'hidden',
          maxWidth: '1100px', width: '100%',
          maxHeight: '85vh',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Image side */}
        <div style={{
          flex: 1, background: '#0d0d0d', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          minHeight: '400px', position: 'relative', overflow: 'hidden',
        }}>
          {/* blurred bg */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${item.imageUrl})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(24px) brightness(0.2)',
            transform: 'scale(1.1)',
          }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={cap || item.projectName}
            style={{
              position: 'relative', zIndex: 1,
              maxWidth: '100%', maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: '4px',
            }}
          />

          {/* Prev/Next arrows */}
          <button onClick={onPrev} style={arrowStyle('left')}>‹</button>
          <button onClick={onNext} style={arrowStyle('right')}>›</button>
        </div>

        {/* Info side */}
        <div style={{
          width: '300px', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid #2a2a2a',
          overflowY: 'auto',
        }}>
          {/* Top red bar */}
          <div style={{ height: '3px', background: 'linear-gradient(90deg, #851e20, #b84042)', flexShrink: 0 }} />

          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
            {/* Project */}
            <div>
              <div style={metaLabel}>Project</div>
              <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700, fontFamily: 'Georgia, serif', lineHeight: 1.3 }}>
                {item.projectName}
              </div>
            </div>

            {/* Date */}
            <div>
              <div style={metaLabel}>Taken</div>
              <div style={metaValue}>{fmt(item.takenAt || item.createdAt)}</div>
            </div>

            {/* Uploaded */}
            {item.createdAt && (
              <div>
                <div style={metaLabel}>Uploaded</div>
                <div style={metaValue}>{fmt(item.createdAt)}</div>
              </div>
            )}

            {/* By */}
            {item.uploaderName && (
              <div>
                <div style={metaLabel}>By</div>
                <div style={metaValue}>{item.uploaderName}</div>
              </div>
            )}

            {/* Location */}
            {item.locationName && (
              <div>
                <div style={metaLabel}>Location</div>
                <div style={metaValue}>{item.locationName}</div>
              </div>
            )}

            {/* Caption */}
            {cap && (
              <div>
                <div style={metaLabel}>{item.commentText ? 'Comment' : 'Description'}</div>
                <div style={{ ...metaValue, fontStyle: 'italic', lineHeight: 1.5, borderLeft: '2px solid #851e20', paddingLeft: '10px' }}>
                  {cap}
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #222' }}>
            <button
              onClick={onClose}
              style={{
                width: '100%', background: '#1e1e1e', color: '#878787',
                border: '1px solid #2a2a2a', borderRadius: '6px',
                padding: '8px', fontFamily: 'monospace', fontSize: '12px',
                letterSpacing: '2px', cursor: 'pointer',
              }}
            >
              ESC TO CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function arrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: '12px',
    background: 'rgba(0,0,0,0.5)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%',
    width: '40px', height: '40px',
    fontSize: '22px', cursor: 'pointer', zIndex: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1,
  };
}

const metaLabel: React.CSSProperties = {
  fontSize: '10px', fontFamily: 'monospace', letterSpacing: '1.5px',
  color: '#851e20', textTransform: 'uppercase', marginBottom: '4px',
};
const metaValue: React.CSSProperties = {
  fontSize: '13px', color: '#c8c8c8', lineHeight: 1.4,
};

// ─── Thumbnail ────────────────────────────────────────────────────────────────

function Thumb({ item, onClick }: { item: FeedItem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const cap = item.commentText || item.description;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', cursor: 'pointer', overflow: 'hidden',
        borderRadius: '6px', background: '#1a1a1a',
        border: `1px solid ${hovered ? '#851e20' : '#222'}`,
        transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
        transform: hovered ? 'scale(1.02)' : 'scale(1)',
        boxShadow: hovered ? '0 8px 32px rgba(133,30,32,0.3)' : '0 2px 8px rgba(0,0,0,0.4)',
        aspectRatio: '4/3',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbnailUrl || item.imageUrl}
        alt={cap || item.projectName}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transition: 'opacity 0.2s ease',
          opacity: hovered ? 0.7 : 1,
        }}
      />

      {/* Hover overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.85) 100%)',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.2s ease',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '12px',
      }}>
        {cap && (
          <p style={{ color: '#e0e0e0', fontSize: '11px', lineHeight: 1.4, fontStyle: 'italic', margin: 0 }}>
            {cap.length > 80 ? cap.slice(0, 80) + '…' : cap}
          </p>
        )}
        {item.uploaderName && (
          <p style={{ color: '#878787', fontSize: '10px', marginTop: '4px', margin: '4px 0 0' }}>
            {item.uploaderName}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main gallery ─────────────────────────────────────────────────────────────

export default function GalleryPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'project' | 'date' | 'none'>('project');

  useEffect(() => {
    fetch('/api/feed')
      .then(r => r.json())
      .then((d: FeedResponse) => { setItems(d.data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.projectName.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      (i.commentText || '').toLowerCase().includes(q) ||
      (i.uploaderName || '').toLowerCase().includes(q) ||
      (i.locationName || '').toLowerCase().includes(q)
    );
  });

  const openLightbox = useCallback((idx: number) => setLightbox(idx), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const prevPhoto = useCallback(() => setLightbox(l => l === null ? null : (l - 1 + filtered.length) % filtered.length), [filtered.length]);
  const nextPhoto = useCallback(() => setLightbox(l => l === null ? null : (l + 1) % filtered.length), [filtered.length]);

  // Group items
  function groupItems() {
    if (groupBy === 'none') return [{ label: `All Photos (${filtered.length})`, items: filtered, indices: filtered.map((_, i) => i) }];

    if (groupBy === 'project') {
      const map = new Map<string, { items: FeedItem[]; indices: number[] }>();
      filtered.forEach((item, i) => {
        if (!map.has(item.projectName)) map.set(item.projectName, { items: [], indices: [] });
        map.get(item.projectName)!.items.push(item);
        map.get(item.projectName)!.indices.push(i);
      });
      return Array.from(map.entries()).map(([label, v]) => ({ label: `${label} (${v.items.length})`, ...v }));
    }

    // group by date
    const map = new Map<string, { items: FeedItem[]; indices: number[] }>();
    filtered.forEach((item, i) => {
      const d = item.createdAt || item.takenAt;
      const label = d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
      if (!map.has(label)) map.set(label, { items: [], indices: [] });
      map.get(label)!.items.push(item);
      map.get(label)!.indices.push(i);
    });
    return Array.from(map.entries()).map(([label, v]) => ({ label: `${label} (${v.items.length})`, ...v }));
  }

  const groups = groupItems();

  // ─── States ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0d0d', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#851e20', animation: `bounce 0.8s ease-in-out ${i * 0.15}s infinite alternate` }} />
        ))}
      </div>
      <style>{`@keyframes bounce { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-12px); opacity: 0.3; } }`}</style>
      <p style={{ color: '#878787', fontFamily: 'monospace', letterSpacing: '2px', fontSize: '12px' }}>LOADING GALLERY</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0d0d', color: '#f7ecec' }}>
      Error: {error}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', color: '#f0f0f0', fontFamily: 'Georgia, serif', overflow: 'auto' }}>

      {/* Top red bar */}
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #851e20, #b84042, #851e20)', position: 'sticky', top: 0, zIndex: 50 }} />

      {/* Header */}
      <div style={{ padding: '32px 48px 24px', borderBottom: '1px solid #1e1e1e', position: 'sticky', top: '3px', background: '#0d0d0d', zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <a href="/" style={{ color: '#3a3a3a', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '2px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', background: '#851e20', borderRadius: '2px' }} />
              ← FEED
            </a>
            <div style={{ width: '1px', height: '20px', background: '#2a2a2a' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: 0 }}>
              Photo Gallery
            </h1>
            <span style={{ fontSize: '13px', color: '#878787', fontFamily: 'monospace' }}>
              {filtered.length} photos
            </span>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search photos…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: '6px',
                color: '#f0f0f0', padding: '8px 14px', fontSize: '13px',
                fontFamily: 'monospace', outline: 'none', width: '220px',
              }}
            />

            {/* Group by */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['project', 'date', 'none'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  style={{
                    background: groupBy === g ? '#851e20' : '#1e1e1e',
                    color: groupBy === g ? '#fff' : '#878787',
                    border: '1px solid #2a2a2a', borderRadius: '4px',
                    padding: '6px 12px', fontSize: '11px', fontFamily: 'monospace',
                    letterSpacing: '1px', cursor: 'pointer', textTransform: 'uppercase',
                  }}
                >
                  {g === 'none' ? 'All' : g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Groups */}
      <div style={{ padding: '32px 48px 64px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#878787', padding: '80px 0', fontFamily: 'monospace' }}>
            No photos match &ldquo;{search}&rdquo;
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} style={{ marginBottom: '48px' }}>
              {/* Group header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div style={{ width: '3px', height: '20px', background: '#851e20', borderRadius: '2px', flexShrink: 0 }} />
                <h2 style={{ fontSize: '15px', color: '#c8c8c8', fontFamily: 'monospace', letterSpacing: '1px', margin: 0, fontWeight: 400 }}>
                  {group.label}
                </h2>
                <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
              </div>

              {/* Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '12px',
              }}>
                {group.items.map((item, localIdx) => (
                  <Thumb
                    key={item.id}
                    item={item}
                    onClick={() => openLightbox(group.indices[localIdx])}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <Lightbox
          item={filtered[lightbox]}
          onClose={closeLightbox}
          onPrev={prevPhoto}
          onNext={nextPhoto}
        />
      )}
    </div>
  );
}
