import { NestFactory } from '@nestjs/core'
import { AppModule } from './app/app.module'
import { ResponseInterceptor } from './common/interceptor/api-response.interceptor'
import { LoggingInterceptor } from './common/interceptor/all-logging.interceptor'
import { AppLogger } from './common/logger/logger.service'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'
import { BigIntInterceptor } from './common/interceptor/bigInt.interceptor'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)

	app.setGlobalPrefix('api')
	app.enableCors({
		origin: '*',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		allowedHeaders: 'Content-Type, Authorization',
	})

	const appLogger = app.get(AppLogger)

	app.useGlobalInterceptors(
		new LoggingInterceptor(appLogger)
		// new BigIntInterceptor(),
		// new ResponseInterceptor()
	)

	app.useGlobalFilters(new AllExceptionsFilter(appLogger))

	await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
