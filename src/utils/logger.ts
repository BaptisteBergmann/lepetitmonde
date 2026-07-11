import pino from 'pino';

export const logger = pino({
  // En dev, on affiche tout (debug), en prod on se limite aux infos importantes
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',

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
