import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { EventsModule } from './events/events.module';
import { WorkersModule } from './workers/workers.module';

const formatResponse = (body: unknown): string => {
  if (body === undefined || body === null) return '';
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  return ` - Response: ${str.length > 300 ? str.slice(0, 300) + '...' : str}`;
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          targets: [
            {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname,context,req,res,responseTime',
                messageFormat: '{if context}[{context}] {end}{msg}',
              },
            },
            {
              target: 'pino-pretty',
              options: {
                destination: './logs/app.log',
                mkdir: true,
                colorize: false,
                singleLine: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname,context,req,res,responseTime',
                messageFormat: '{if context}[{context}] {end}{msg}',
              },
            },
          ],
        },
        customProps: () => ({ context: 'HTTP' }),
        customSuccessMessage: (req: any, res: any, time: number) =>
          `${req.method} ${req.url} ${res.statusCode} (${time}ms)${formatResponse(res.__body)}`,
        customErrorMessage: (req: any, res: any, err: Error) =>
          `${req.method} ${req.url} ${res.statusCode || 500} - ${err.message}${formatResponse(res.__body)}`,
        customLogLevel: (req: any, res: any, err: any) =>
          res.statusCode >= 500 || err ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      },
    }),
    PrismaModule,
    WebhooksModule,
    EventsModule,
    WorkersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
