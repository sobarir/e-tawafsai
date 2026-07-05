import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { ulid } from "ulid";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import * as path from "path";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // ULID request ids: time-ordered and grep-able across logs.
    new FastifyAdapter({ genReqId: () => ulid() }),
    { bufferLogs: true },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(fastifyCookie as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(fastifyMultipart as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(fastifyStatic as any, {
    root: path.join(process.cwd(), "public/uploads"),
    prefix: "/uploads/",
    decorateReply: false,
  });

  app.useLogger(app.get(Logger));

  // Every response carries its request id for log correlation.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onSend", (request, reply, _payload, done) => {
      void reply.header("x-request-id", request.id);
      done();
    });

  const config = app.get(ConfigService);
  app.enableCors({
    origin: config.getOrThrow<string>("CORS_ORIGIN"),
    credentials: true,
  });

  const port = config.getOrThrow<number>("PORT");
  await app.listen({ port, host: "0.0.0.0" });
}

void bootstrap();
