import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          targets: [
            ...(process.env.NODE_ENV !== 'production'
              ? [
                  {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                    },
                    level: 'info',
                  },
                ]
              : [
                  {
                    target: 'pino/file',
                    options: { destination: 1 },
                    level: 'info',
                  },
                ]),
            {
              target: 'pino/file',
              options: {
                destination: './logs/app.log',
                mkdir: true,
              },
              level: 'info',
            },
          ],
        },
      },
    }),
    PrismaModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
