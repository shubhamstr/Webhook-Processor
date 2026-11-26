import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableCors();
  app.useLogger(app.get(Logger));

  // Capture response body for logger details
  app.use((_req: any, res: any, next: any) => {
    const send = res.send;
    res.send = (body: any) => {
      res.__body = body;
      return send.call(res, body);
    };
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  app.get(Logger).log(`Server is running on: http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
