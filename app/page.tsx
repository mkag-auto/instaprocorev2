import dynamic from 'next/dynamic';

// FeedClient uses browser APIs (localStorage, etc.) — disable SSR entirely
const FeedClient = dynamic(() => import('./FeedClient'), { ssr: false });

export default function Page() {
  return <FeedClient />;
}
