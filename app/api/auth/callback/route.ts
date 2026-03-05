import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  const baseUrl = process.env.PROCORE_BASE_URL || 'https://api.procore.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = appUrl.startsWith('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${appUrl}/api/auth/callback`;

  if (error) {
    return new NextResponse(errorPage(error, 'Procore returned an error during authorization.'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code) {
    return new NextResponse(errorPage('no_code', 'No authorization code received from Procore.'), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.PROCORE_CLIENT_ID,
      client_secret: process.env.PROCORE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return new NextResponse(errorPage(`${tokenRes.status}`, body), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const tokens = await tokenRes.json();

  return new NextResponse(successPage(tokens.access_token, tokens.refresh_token, appUrl, protocol), {
    headers: { 'Content-Type': 'text/html' },
  });
}

function successPage(accessToken: string, refreshToken: string, appUrl: string, protocol: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>InstaProcore — Auth Success</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', monospace;
      background: #0d0d0d;
      color: #f0f0f0;
      padding: 40px 20px;
      min-height: 100vh;
    }
    .container { max-width: 860px; margin: 0 auto; }
    .header { border-left: 4px solid #851e20; padding-left: 20px; margin-bottom: 40px; }
    h1 { font-size: 28px; color: #fff; margin-bottom: 8px; }
    .subtitle { color: #878787; font-size: 14px; }
    .checkmark { color: #4caf50; margin-right: 8px; }
    .token-block { margin: 24px 0; }
    .token-label {
      font-size: 11px;
      font-weight: bold;
      color: #851e20;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .token-value {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 14px 16px;
      font-size: 12px;
      word-break: break-all;
      line-height: 1.6;
      color: #e0e0e0;
      position: relative;
    }
    .copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: #851e20;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
    }
    .copy-btn:hover { background: #b84042; }
    .steps { margin: 32px 0; }
    .steps h2 { color: #fff; font-size: 18px; margin-bottom: 16px; }
    .step {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
      align-items: flex-start;
      background: #141414;
      border: 1px solid #222;
      border-radius: 6px;
      padding: 14px 16px;
    }
    .step-num {
      background: #851e20;
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      flex-shrink: 0;
    }
    .step-text { font-size: 13px; line-height: 1.5; color: #ccc; }
    code {
      background: #2a2a2a;
      color: #f7ecec;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
    .warning {
      background: #1a0f0f;
      border: 1px solid #851e20;
      border-radius: 6px;
      padding: 14px 16px;
      font-size: 13px;
      color: #e0a0a0;
      margin-top: 32px;
    }
    a { color: #b84042; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="checkmark">✓</span> Authentication Successful</h1>
      <p class="subtitle">Copy the tokens below into your Vercel environment variables.</p>
    </div>

    <div class="token-block">
      <div class="token-label">PROCORE_ACCESS_TOKEN</div>
      <div class="token-value" id="at">
        ${accessToken}
        <button class="copy-btn" onclick="copyTo('at', this)">Copy</button>
      </div>
    </div>

    <div class="token-block">
      <div class="token-label">PROCORE_REFRESH_TOKEN</div>
      <div class="token-value" id="rt">
        ${refreshToken}
        <button class="copy-btn" onclick="copyTo('rt', this)">Copy</button>
      </div>
    </div>

    <div class="steps">
      <h2>Next Steps</h2>
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text">Go to <strong>Vercel Dashboard → Your Project → Settings → Environment Variables</strong></div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text">Add or update <code>PROCORE_ACCESS_TOKEN</code> with the value above (all environments)</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text">Add or update <code>PROCORE_REFRESH_TOKEN</code> with the value above (all environments)</div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-text">Go to <strong>Deployments</strong> tab → click <strong>⋯</strong> on the latest deployment → <strong>Redeploy</strong></div>
      </div>
      <div class="step">
        <div class="step-num">5</div>
        <div class="step-text">
          Your feed at <a href="${protocol}://${appUrl}/" target="_blank">${protocol}://${appUrl}/</a> will now work.<br/>
          <strong>Optional:</strong> Add <code>VERCEL_TOKEN</code> and <code>VERCEL_PROJECT_ID</code> env vars so future token refreshes happen automatically without manual steps.
        </div>
      </div>
    </div>

    <div class="warning">
      ⚠️ These tokens grant full access to your Procore account. Do not share them or commit them to version control.
    </div>
  </div>

  <script>
    function copyTo(id, btn) {
      const el = document.getElementById(id);
      const text = el.childNodes[0].textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      });
    }
  </script>
</body>
</html>`;
}

function errorPage(code: string, message: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>InstaProcore — Auth Error</title>
  <style>
    body { font-family: monospace; background: #0d0d0d; color: #f0f0f0; padding: 40px; }
    h1 { color: #851e20; }
    pre { background: #1a1a1a; padding: 16px; border-radius: 6px; margin-top: 16px; white-space: pre-wrap; word-break: break-all; }
    a { color: #b84042; }
  </style>
</head>
<body>
  <h1>✗ Authentication Failed</h1>
  <p>Error code: <strong>${code}</strong></p>
  <pre>${message}</pre>
  <p style="margin-top:24px"><a href="/api/auth">← Try again</a></p>
</body>
</html>`;
}
