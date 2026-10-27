import './env';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Explicit bounded body parsers to prevent large payload memory exhaustion attacks
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));

  // Reverse proxy IP resolution: only trust proxy when explicitly enabled via TRUST_PROXY
  // Default is false (untrusted direct connection). When TRUST_PROXY=true/1, exactly 1 hop is trusted.
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv === 'true' || trustProxyEnv === '1') {
    app.set('trust proxy', 1);
  } else {
    app.set('trust proxy', false);
  }

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  // Strict exact-origin CORS for credentialed frontend requests
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`DevPulse API server running on http://localhost:${port}`);
}

bootstrap();
