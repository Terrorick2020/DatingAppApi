import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { ResponseInterceptor } from './common/interceptor/api-response.interceptor'
import { LoggingInterceptor } from './common/interceptor/all-logging.interceptor'
import { AppLogger } from './common/logger/logger.service'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { BigIntInterceptor } from './common/interceptor/bigInt.interceptor'
import { PrismaService } from '~/prisma/prisma.service'
import { UserStatusGuard } from './common/guards/user.status.guard'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	app.setGlobalPrefix('api')
	app.enableCors({
		origin: '*',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		allowedHeaders: 'Content-Type, Authorization',
	})

	const appLogger = app.get(AppLogger)

	const reflector = app.get(Reflector)
	const prisma = app.get(PrismaService)

	app.useGlobalGuards(new UserStatusGuard(prisma, reflector))

	app.useGlobalInterceptors(
		new LoggingInterceptor(appLogger)
		// new ResponseInterceptor()
	)

	app.useGlobalFilters(new AllExceptionsFilter(appLogger))

	await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
