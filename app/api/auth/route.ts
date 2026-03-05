import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.PROCORE_CLIENT_ID;
  const baseUrl = process.env.PROCORE_BASE_URL || 'https://api.procore.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = appUrl.startsWith('localhost') ? 'http' : 'https';

  if (!clientId) {
    return NextResponse.json({ error: 'PROCORE_CLIENT_ID not configured' }, { status: 500 });
  }

  const redirectUri = `${protocol}://${appUrl}/api/auth/callback`;
  process.env.PROCORE_REDIRECT_URI = redirectUri; // store for use in callback

  const authUrl = new URL(`${baseUrl}/oauth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);

  return NextResponse.redirect(authUrl.toString());
}
