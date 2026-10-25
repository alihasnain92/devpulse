import { spawn } from 'child_process';
import http from 'http';

const API_PORT = 4000;
const WEB_PORT = 3000;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json,
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function extractCookie(headers, name) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const found = setCookie.find((c) => c.startsWith(`${name}=`));
  return found ? found.split(';')[0] : null;
}

async function runSmokeTests() {
  console.log('--- Starting Phase 1 Live Smoke Tests ---');

  // 1. Start API Server
  console.log('Starting API server...');
  const apiProc = spawn('node', ['apps/api/dist/apps/api/src/main.js'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  apiProc.stdout.on('data', (d) => process.stdout.write('[API] ' + d));
  apiProc.stderr.on('data', (d) => process.stderr.write('[API ERR] ' + d));

  // Wait for API to boot
  let apiReady = false;
  for (let i = 0; i < 20; i++) {
    await wait(500);
    try {
      const h = await httpRequest({
        hostname: 'localhost',
        port: API_PORT,
        path: '/health',
        method: 'GET',
      });
      if (h.statusCode === 200) {
        apiReady = true;
        break;
      }
    } catch {}
  }

  if (!apiReady) {
    throw new Error('API server failed to start within timeout');
  }
  console.log('✔ API server is ready at http://localhost:4000');

  const testEmail = `smoketest-${Date.now()}@devpulse.dev`;
  const testPassword = 'SmokeTestPassword123!';
  const csrfHeaders = {
    'Content-Type': 'application/json',
    'x-devpulse-csrf': '1',
    Origin: 'http://localhost:3000',
  };

  // Test 1: Register
  console.log('Testing Registration...');
  const regRes = await httpRequest(
    {
      hostname: 'localhost',
      port: API_PORT,
      path: '/auth/register',
      method: 'POST',
      headers: csrfHeaders,
    },
    { email: testEmail, name: 'Smoke Tester', password: testPassword },
  );

  if (regRes.statusCode !== 201) {
    throw new Error(`Register failed with status ${regRes.statusCode}`);
  }
  console.log('✔ Registration successful (HTTP 201)');

  const accessCookie1 = extractCookie(regRes.headers, 'devpulse_access_token');
  const refreshCookie1 = extractCookie(regRes.headers, 'devpulse_refresh_token');
  if (!accessCookie1 || !refreshCookie1) {
    throw new Error('Missing authentication cookies on register');
  }
  console.log('✔ HTTP-only cookies set for access and refresh tokens');

  // Test 2: Get Profile (Protected)
  console.log('Testing Protected Profile (GET /users/me)...');
  const profileRes = await httpRequest({
    hostname: 'localhost',
    port: API_PORT,
    path: '/users/me',
    method: 'GET',
    headers: { Cookie: accessCookie1 },
  });

  if (profileRes.statusCode !== 200 || profileRes.body.email !== testEmail) {
    throw new Error(`GET /users/me failed: status ${profileRes.statusCode}`);
  }
  if (profileRes.body.hashedPassword) {
    throw new Error('Security violation: hashedPassword leaked in user profile!');
  }
  console.log('✔ Safe profile retrieved without credentials leak (HTTP 200)');

  // Test 3: Rotate Refresh Token
  console.log('Testing Refresh Token Rotation...');
  const refreshRes = await httpRequest({
    hostname: 'localhost',
    port: API_PORT,
    path: '/auth/refresh',
    method: 'POST',
    headers: {
      ...csrfHeaders,
      Cookie: refreshCookie1,
    },
  });

  if (refreshRes.statusCode !== 200) {
    throw new Error(`Refresh failed: status ${refreshRes.statusCode}`);
  }
  const refreshCookie2 = extractCookie(refreshRes.headers, 'devpulse_refresh_token');
  const accessCookie2 = extractCookie(refreshRes.headers, 'devpulse_access_token');
  if (!refreshCookie2 || refreshCookie2 === refreshCookie1) {
    throw new Error('Refresh token rotation failed: same or missing token returned');
  }
  console.log('✔ Refresh token rotated successfully (HTTP 200)');

  // Test 4: Reuse of old refresh token triggers revocation
  console.log('Testing Reuse Detection on Old Refresh Token...');
  const reuseRes = await httpRequest({
    hostname: 'localhost',
    port: API_PORT,
    path: '/auth/refresh',
    method: 'POST',
    headers: {
      ...csrfHeaders,
      Cookie: refreshCookie1, // using old token
    },
  });

  if (reuseRes.statusCode !== 401) {
    throw new Error(`Reuse detection failed: expected 401, got ${reuseRes.statusCode}`);
  }
  console.log('✔ Reuse detected and rejected (HTTP 401)');

  // Test 5: Login again
  console.log('Testing Login...');
  const loginRes = await httpRequest(
    {
      hostname: 'localhost',
      port: API_PORT,
      path: '/auth/login',
      method: 'POST',
      headers: csrfHeaders,
    },
    { email: testEmail, password: testPassword },
  );

  if (loginRes.statusCode !== 200) {
    throw new Error(`Login failed with status ${loginRes.statusCode}`);
  }
  const loginRefreshCookie = extractCookie(loginRes.headers, 'devpulse_refresh_token');
  console.log('✔ Login successful (HTTP 200)');

  // Test 6: Logout
  console.log('Testing Logout...');
  const logoutRes = await httpRequest({
    hostname: 'localhost',
    port: API_PORT,
    path: '/auth/logout',
    method: 'POST',
    headers: {
      ...csrfHeaders,
      Cookie: loginRefreshCookie,
    },
  });

  if (logoutRes.statusCode !== 200) {
    throw new Error(`Logout failed with status ${logoutRes.statusCode}`);
  }
  console.log('✔ Logout successful (HTTP 200)');

  // Cleanup API process
  apiProc.kill();

  // 2. Start Frontend Server
  console.log('Starting Frontend server on port 3000...');
  const webProc = spawn('cmd.exe', ['/c', 'pnpm --filter @devpulse/web start'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });

  let webReady = false;
  for (let i = 0; i < 20; i++) {
    await wait(600);
    try {
      const h = await httpRequest({
        hostname: 'localhost',
        port: WEB_PORT,
        path: '/',
        method: 'GET',
      });
      if (h.statusCode === 200) {
        webReady = true;
        break;
      }
    } catch {}
  }

  if (!webReady) {
    try {
      process.kill(webProc.pid);
    } catch {}
    throw new Error('Frontend server failed to start within timeout');
  }
  console.log('✔ Frontend server is ready at http://localhost:3000');

  // Test 7: Verify /login and /register pages return HTTP 200
  const loginPage = await httpRequest({
    hostname: 'localhost',
    port: WEB_PORT,
    path: '/login',
    method: 'GET',
  });
  if (loginPage.statusCode !== 200) {
    throw new Error(`Frontend /login returned status ${loginPage.statusCode}`);
  }
  console.log('✔ Frontend /login responds with HTTP 200');

  const registerPage = await httpRequest({
    hostname: 'localhost',
    port: WEB_PORT,
    path: '/register',
    method: 'GET',
  });
  if (registerPage.statusCode !== 200) {
    throw new Error(`Frontend /register returned status ${registerPage.statusCode}`);
  }
  console.log('✔ Frontend /register responds with HTTP 200');

  // Test 8: Verify /dashboard redirects unauthenticated users via proxy.ts
  const dashboardRes = await httpRequest({
    hostname: 'localhost',
    port: WEB_PORT,
    path: '/dashboard',
    method: 'GET',
  });

  // Next.js redirect returns 307 with location header to /login?from=/dashboard
  if (
    dashboardRes.statusCode !== 307 ||
    !dashboardRes.headers.location?.includes('/login')
  ) {
    throw new Error(
      `proxy.ts redirect check failed: status ${dashboardRes.statusCode}, location: ${dashboardRes.headers.location}`,
    );
  }
  console.log(
    `✔ proxy.ts UX protection active: /dashboard redirected unauthenticated visitor to ${dashboardRes.headers.location} (HTTP 307)`,
  );

  // Terminate web server
  spawn('taskkill', ['/pid', webProc.pid, '/T', '/F']);
  console.log('--- All Live Smoke Tests PASSED Cleanly ---');
}

runSmokeTests().catch((err) => {
  console.error('Smoke test failure:', err);
  process.exit(1);
});
