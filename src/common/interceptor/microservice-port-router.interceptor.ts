import {
	Injectable,
	NestInterceptor,
	ExecutionContext,
	CallHandler,
} from '@nestjs/common'
import { Observable, of } from 'rxjs'

@Injectable()
export class MicroservicePortRouterInterceptor implements NestInterceptor {
	constructor(private readonly targetPort: number) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const contextType = context.getType()

		// Если это не RPC (микросервисный контекст), просто продолжаем
		if (contextType !== 'rpc') {
			return next.handle()
		}

		const rpcContext = context.switchToRpc()
		const metadata = rpcContext.getContext()

		// Получаем информацию о порте из контекста
		const connection = metadata?.args?.[1]?.connection
		const port = connection?.remotePort || connection?.port

		// Если порта нет или он не соответствует целевому, отклоняем запрос
		if (!port || port !== this.targetPort) {
			console.warn(
				`Request to wrong port. Expected: ${this.targetPort}, Got: ${port}`
			)
			return of({
				error: 'ACCESS_DENIED',
				message: 'Request received on wrong microservice port',
			})
		}

		// Порт совпадает, продолжаем выполнение
		return next.handle()
	}
}
