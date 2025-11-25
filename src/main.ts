import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.map((error) =>
          Object.values(error.constraints || {}).join(', '),
        );
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: messages.join('; '),
          errors: errors.map((error) => ({
            property: error.property,
            constraints: error.constraints,
          })),
        });
      },
    }),
  );

  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
