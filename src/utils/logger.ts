import pino from 'pino';

export const logger = pino({
  // En dev, on affiche tout (debug), en prod on se limite aux infos importantes
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',

  // Backstop only: call sites should not log personal data in the first place.
  // `path` is deliberately not redacted (it would blank storage/upload debug
  // logs); share-token paths are handled at the source.
  redact: {
    paths: [
      'to', '*.to', 'email', '*.email',
      'token', '*.token', 'token_hash', '*.token_hash',
      'subscription', '*.subscription', 'endpoint', '*.endpoint',
      'ip', '*.ip',
      'nickname', '*.nickname',
      'cookie', '*.cookie', 'authorization', '*.authorization',
      'headers.cookie', 'headers.authorization',
      '*.headers.cookie', '*.headers.authorization',
      'access_token', '*.access_token', 'refresh_token', '*.refresh_token',
      'password', '*.password',
    ],
    censor: '[redacted]',
  },

  // Utilise pino-pretty uniquement en développement
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname', // Garde le terminal propre
      },
    },
  }),
});
