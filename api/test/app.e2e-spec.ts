import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * End-to-end smoke test.
 *
 * This boots the real AppModule, so it needs a reachable MongoDB at
 * MONGODB_URI (see api/.env.example). It is intentionally excluded from
 * `npm test` — jest's unit config has rootDir `src`, and this file lives in
 * `test/`. Run it with `npm run test:e2e` once Mongo is up.
 */
describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so routes and validation behave as they do in production.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports healthy when the database is reachable', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.info).toHaveProperty('mongodb');
      });
  });

  it('rejects an unauthenticated request to a protected route', () => {
    return request(app.getHttpServer()).get('/api/projects').expect(401);
  });

  it('rejects registration with an invalid payload', () => {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email' })
      .expect(400);
  });
});
