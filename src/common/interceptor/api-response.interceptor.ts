import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { ApiResponse } from '../interfaces/api-response.interface'

@Injectable()
export class ResponseInterceptor<T>
	implements NestInterceptor<T, ApiResponse<T>>
{
	intercept(
		context: ExecutionContext,
		next: CallHandler<T>
	): Observable<ApiResponse<T>> {
		return next.handle().pipe(
			map(data => ({
				success: true,
				message: 'OK',
				data,
			}))
		)
	}
}
