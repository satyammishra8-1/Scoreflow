function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  for (const [name, value] of [
    ['MONGODB_URI', process.env.MONGODB_URI],
    ['JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET],
    ['CLIENT_ORIGINS', process.env.CLIENT_ORIGINS],
    ['CLIENT_URL', process.env.CLIENT_URL],
    ['AI_SERVICE_URL', process.env.AI_SERVICE_URL],
    ['AI_SERVICE_SHARED_SECRET', process.env.AI_SERVICE_SHARED_SECRET],
    ['BREVO_API_KEY', process.env.BREVO_API_KEY],
    ['BREVO_SENDER_EMAIL', process.env.BREVO_SENDER_EMAIL],
    ['LLM_PROVIDER', process.env.LLM_PROVIDER],
  ]) if (!String(value || '').trim()) missing.push(name);
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'AI_SERVICE_SHARED_SECRET']) {
    const secret = String(process.env[name] || '');
    if (secret && (Buffer.byteLength(secret, 'utf8') < 32 || new Set(secret).size < 16)) {
      missing.push(`${name} (use a strong secret of at least 32 bytes)`);
    }
  }
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) missing.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  const provider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
  const mongoUri = String(process.env.MONGODB_URI || '').trim();
  const srvMongoUri = /^mongodb\+srv:\/\//i.test(mongoUri);
  const explicitTlsDisabled = /[?&](?:tls|ssl)=false(?:&|$)/i.test(mongoUri);
  if (mongoUri && ((!srvMongoUri && !/[?&](?:tls|ssl)=true(?:&|$)/i.test(mongoUri)) || explicitTlsDisabled)) {
    missing.push('MONGODB_URI (TLS required in production)');
  }
  if (process.env.CLIENT_URL) {
    try {
      const parsed = new URL(process.env.CLIENT_URL);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        missing.push('CLIENT_URL (canonical HTTPS URL required)');
      }
    } catch {
      missing.push('CLIENT_URL (valid HTTPS URL required)');
    }
  }
  if (process.env.CLIENT_ORIGINS) {
    const origins = process.env.CLIENT_ORIGINS.split(',').map((origin) => origin.trim());
    if (origins.some((origin) => !origin || (() => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol !== 'https:' || parsed.origin !== origin;
      } catch { return true; }
    })())) missing.push('CLIENT_ORIGINS (exact HTTPS origins required)');
  }
  if (process.env.AI_SERVICE_URL) {
    try {
      const serviceUrl = new URL(process.env.AI_SERVICE_URL);
      if (!['https:', 'http:'].includes(serviceUrl.protocol) || serviceUrl.username || serviceUrl.password) {
        missing.push('AI_SERVICE_URL (valid service URL required)');
      }
    } catch {
      missing.push('AI_SERVICE_URL (valid service URL required)');
    }
  }
  if (process.env.BREVO_SENDER_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.BREVO_SENDER_EMAIL.trim())) {
    missing.push('BREVO_SENDER_EMAIL (valid email address required)');
  }
  if (provider === 'gemini' && !String(process.env.GEMINI_API_KEY || '').trim()) missing.push('GEMINI_API_KEY');
  if (provider === 'openai' && !String(process.env.OPENAI_API_KEY || '').trim()) missing.push('OPENAI_API_KEY');
  if (!['gemini', 'openai'].includes(provider)) missing.push('LLM_PROVIDER (gemini or openai)');
  if (missing.length) throw new Error(`Production configuration is incomplete: ${[...new Set(missing)].join(', ')}`);
}

function securityHeaders(_req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return next();
}

module.exports = { assertProductionConfiguration, securityHeaders };
