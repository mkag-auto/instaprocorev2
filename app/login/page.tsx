'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const [key, setKey] = useState('');
  const params = useSearchParams();
  const from = params.get('from') || '/';

  function handleSubmit() {
    if (!key.trim()) return;
    window.location.href = `${from}?key=${encodeURIComponent(key.trim())}`;
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0d0d0d', flexDirection: 'column', gap: '24px'
    }}>
      <div style={{ width: '4px', height: '48px', background: '#851e20', borderRadius: '2px' }} />
      <p style={{ color: '#878787', fontFamily: 'monospace', letterSpacing: '3px', fontSize: '12px' }}>
        INSTAPROCORE
      </p>
      <input
        type="password"
        placeholder="Enter access key"
        value={key}
        onChange={e => setKey(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        autoFocus
        style={{
          background: '#141414', border: '1px solid #2a2a2a', borderRadius: '6px',
          color: '#f0f0f0', padding: '12px 20px', fontSize: '16px',
          fontFamily: 'monospace', outline: 'none', width: '280px',
          textAlign: 'center', letterSpacing: '4px',
        }}
      />
      <button
        onClick={handleSubmit}
        style={{
          background: '#851e20', color: 'white', border: 'none',
          borderRadius: '6px', padding: '10px 32px', fontSize: '13px',
          fontFamily: 'monospace', letterSpacing: '2px', cursor: 'pointer',
        }}
      >
        ENTER
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
