import { Injectable } from '@nestjs/common'
import { createLogger, format, transports } from 'winston'

const { combine, timestamp, printf, errors } = format

@Injectable()
export class AppLogger {
	private logger = createLogger({
		level: 'info',
		format: combine(
			timestamp(),
			errors({ stack: true }),
			printf(({ timestamp, level, message, stack }) => {
				return `${timestamp} ${level.toUpperCase()}: ${message}${stack ? '\n' + stack : ''}`
			})
		),
		transports: [
			new transports.File({ filename: 'logs/error.log', level: 'error' }),
			new transports.File({ filename: 'logs/combined.log' }),
		],
	})

	log(message: string) {
		this.logger.info(message)
	}

	error(message: string, trace?: string) {
		this.logger.error(`${message}\n${trace || ''}`)
	}

	warn(message: string) {
		this.logger.warn(message)
	}
}
