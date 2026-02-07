const allowedSchemes = new Set([
  'serviceproviderapp',
  'exp',
  'exps',
  'exp+serviceproviderapp',
]);

const buildFallbackUrl = (type: string) => {
  const path = type === 'refresh' ? 'signup' : 'stripe-complete';
  return `serviceproviderapp://${path}`;
};

export default function handler(req: any, res: any) {
  const type = typeof req.query?.type === 'string' ? req.query.type : 'complete';
  const redirectParam = typeof req.query?.redirect === 'string' ? req.query.redirect : '';
  const fallbackUrl = buildFallbackUrl(type);

  if (!redirectParam) {
    res.writeHead(302, { Location: fallbackUrl });
    res.end();
    return;
  }

  try {
    const parsed = new URL(redirectParam);
    const scheme = parsed.protocol.replace(':', '');
    if (!allowedSchemes.has(scheme)) {
      res.writeHead(302, { Location: fallbackUrl });
      res.end();
      return;
    }

    res.writeHead(302, { Location: redirectParam });
    res.end();
  } catch (_error) {
    res.writeHead(302, { Location: fallbackUrl });
    res.end();
  }
}

