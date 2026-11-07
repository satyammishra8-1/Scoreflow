function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  for (const [name, value] of [
    ['MONGODB_URI', process.env.MONGODB_URI],
    ['JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET],
    ['ORGANIZER_SETUP_TOKEN', process.env.ORGANIZER_SETUP_TOKEN],
    ['ORGANIZER_EMAIL_ALLOWLIST', process.env.ORGANIZER_EMAIL_ALLOWLIST],
    ['CLIENT_ORIGINS', process.env.CLIENT_ORIGINS],
    ['CLIENT_URL', process.env.CLIENT_URL],
    ['AI_SERVICE_URL', process.env.AI_SERVICE_URL],
    ['AI_SERVICE_SHARED_SECRET', process.env.AI_SERVICE_SHARED_SECRET],
    ['BREVO_API_KEY', process.env.BREVO_API_KEY],
    ['BREVO_SENDER_EMAIL', process.env.BREVO_SENDER_EMAIL],
    ['LLM_PROVIDER', process.env.LLM_PROVIDER],
  ]) if (!String(value || '').trim()) missing.push(name);
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ORGANIZER_SETUP_TOKEN', 'AI_SERVICE_SHARED_SECRET']) {
    if (process.env[name] && Buffer.byteLength(process.env[name], 'utf8') < 32) missing.push(`${name} (minimum 32 bytes)`);
  }
  const allowlist = (process.env.ORGANIZER_EMAIL_ALLOWLIST || '').split(',').map((email) => email.trim()).filter(Boolean);
  if (allowlist.length !== 2) missing.push('ORGANIZER_EMAIL_ALLOWLIST (exactly two comma-separated emails)');
  else if (allowlist.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || new Set(allowlist.map((email) => email.toLowerCase())).size !== 2) {
    missing.push('ORGANIZER_EMAIL_ALLOWLIST (two distinct valid emails)');
  }
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) missing.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  const provider = String(process.env.LLM_PROVIDER || '').trim().toLowerCase();
  const mongoUri = String(process.env.MONGODB_URI || '').trim();
  const srvMongoUri = /^mongodb\+srv:\/\//i.test(mongoUri);
  const explicitTlsDisabled = /[?&](?:tls|ssl)=false(?:&|$)/i.test(mongoUri);
  if (mongoUri && ((!srvMongoUri && !/[?&](?:tls|ssl)=true(?:&|$)/i.test(mongoUri)) || explicitTlsDisabled)) {
    missing.push('MONGODB_URI (TLS required in production)');
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
