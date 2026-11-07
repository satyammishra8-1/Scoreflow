const path = require('node:path');

if (path.basename(process.argv[1] || '').toLowerCase() === 'server.js') {
  const http = require('node:http');
  const mongoose = require(path.join(process.cwd(), 'node_modules/mongoose'));
  const realFetch = global.fetch;
  let verificationLink = '';
  let sendCount = 0;
  const expectedRecipient = process.env.SCOREFLOW_EMAIL_EXPECTED_RECIPIENT;

  global.fetch = async (input, init = {}) => {
    if (String(input) !== 'https://api.brevo.com/v3/smtp/email') return realFetch(input, init);
    let payload;
    try { payload = JSON.parse(init.body || '{}'); } catch { return new Response('{}', { status: 400 }); }
    const to = payload.to || [];
    const html = String(payload.htmlContent || '');
    const match = html.match(/href="(https?:[^" ]+\/organizer\/verify\/[A-Za-z0-9_-]+)"/);
    if (to.length !== 1 || to[0].email !== expectedRecipient || !match || sendCount !== 0) {
      return new Response(JSON.stringify({ message: 'test email guard rejected request' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    sendCount += 1;
    verificationLink = match[1];
    await new Promise((resolve) => setTimeout(resolve, 500));
    return new Response(JSON.stringify({ messageId: 'test-email-mocked' }), { status: 201, headers: { 'content-type': 'application/json' } });
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url === '/status') {
      return res.end(JSON.stringify({ mocked: true, sendCount, recipientMatched: sendCount === 0 || Boolean(verificationLink), tokenCaptured: Boolean(verificationLink), localLink: verificationLink.startsWith(`${process.env.CLIENT_URL}/organizer/verify/`) }));
    }
    if (req.method === 'GET' && req.url === '/link') {
      if (!verificationLink) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'not captured' })); }
      const link = verificationLink;
      verificationLink = '';
      return res.end(JSON.stringify({ link }));
    }
    if (req.method === 'GET' && req.url === '/database') {
      if (mongoose.connection.readyState !== 1) { res.statusCode = 503; return res.end(JSON.stringify({ ready: false })); }
      try {
        const email = process.env.ORGANIZER_EMAIL_ALLOWLIST;
        const Registration = mongoose.model('OrganizerRegistration');
        const Account = mongoose.model('OrganizerAccount');
        const pending = await Registration.findOne({ email }).select('+passwordHash');
        const active = await Account.findOne({ email }).select('+passwordHash');
        return res.end(JSON.stringify({ ready: true, dbName: mongoose.connection.name, pending: Boolean(pending), pendingHasBcryptHash: Boolean(pending?.passwordHash && pending.passwordHash.startsWith('$2')), active: Boolean(active), activeHasBcryptHash: Boolean(active?.passwordHash && active.passwordHash.startsWith('$2')) }));
      } catch {
        res.statusCode = 500;
        return res.end(JSON.stringify({ ready: false, queryFailed: true }));
      }
    }
    if (req.method === 'POST' && req.url === '/cleanup') {
      if (mongoose.connection.readyState !== 1) { res.statusCode = 503; return res.end(JSON.stringify({ dropped: false })); }
      await mongoose.connection.dropDatabase();
      return res.end(JSON.stringify({ dropped: true, dbName: mongoose.connection.name }));
    }
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(5001, '127.0.0.1');
  console.log('Test-only email mock active on loopback.');
}
