import { Injectable } from '@nestjs/common'
import { createLogger, format, transports } from 'winston'

const { combine, timestamp, printf, errors, colorize } = format

@Injectable()
export class AppLogger {
	private logger = createLogger({
		level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
		format: combine(
			timestamp(),
			errors({ stack: true }),
			printf(({ timestamp, level, message, stack, context, metadata }) => {
				let logMessage = `${timestamp} ${level.toUpperCase()}`

				if (context) {
					logMessage += ` [${context}]`
				}

				logMessage += `: ${message}`

				if (metadata) {
					try {
						const metadataStr =
							typeof metadata === 'string'
								? metadata
								: JSON.stringify(metadata, null, 2)
						logMessage += `\nMetadata: ${metadataStr}`
					} catch (e) {
						logMessage += `\nMetadata: [Невозможно сериализовать]`
					}
				}

				if (stack) {
					logMessage += `\nStack: ${stack}`
				}

				return logMessage
			})
		),
		transports: [
			new transports.File({
				filename: 'logs/error.log',
				level: 'error',
				maxsize: 10485760, // 10MB
				maxFiles: 5,
			}),
			new transports.File({
				filename: 'logs/combined.log',
				maxsize: 10485760, // 10MB
				maxFiles: 10,
			}),
		],
	})

	constructor() {
		// Добавляем консольный транспорт для не-продакшн сред
		if (process.env.NODE_ENV !== 'production') {
			this.logger.add(
				new transports.Console({
					format: combine(
						colorize({ all: true }),
						timestamp(),
						printf(({ timestamp, level, message, context, metadata }) => {
							let logMessage = `${timestamp} ${level}`

							if (context) {
								logMessage += ` [${context}]`
							}

							logMessage += `: ${message}`

							if (metadata) {
								try {
									const metadataStr =
										typeof metadata === 'string'
											? metadata
											: JSON.stringify(metadata, null, 2)
									logMessage += `\nMetadata: ${metadataStr}`
								} catch (e) {
									logMessage += `\nMetadata: [Невозможно сериализовать]`
								}
							}

							return logMessage
						})
					),
				})
			)
		}
	}

	/**
	 * Логирование информационных сообщений
	 */
	log(message: string, context?: string, metadata?: any) {
		this.logger.info(message, { context, metadata })
	}

	/**
	 * Логирование ошибок с контекстом и метаданными
	 */
	error(
		message: string,
		trace?: string | undefined,
		context?: string,
		metadata?: any
	) {
		const errorData = {
			context,
			metadata,
			stack: trace,
		}
		this.logger.error(message, errorData)
	}

	/**
	 * Логирование предупреждений
	 */
	warn(message: string, context?: string, metadata?: any) {
		this.logger.warn(message, { context, metadata })
	}

	/**
	 * Логирование отладочной информации
	 */
	debug(message: string, context?: string, metadata?: any) {
		this.logger.debug(message, { context, metadata })
	}

	/**
	 * Логирование критических ошибок
	 */
	fatal(
		message: string,
		trace?: string | undefined,
		context?: string,
		metadata?: any
	) {
		const errorData = {
			context,
			metadata,
			stack: trace,
		}
		this.logger.error(`FATAL: ${message}`, errorData)
	}

	/**
	 * Логирование HTTP запросов
	 */
	logHttpRequest(
		method: string,
		url: string,
		ip: string,
		body: any,
		statusCode?: number | undefined,
		duration?: number | undefined
	) {
		const requestData = {
			method,
			url,
			ip,
			body: body ? JSON.stringify(body) : 'Нет тела запроса',
			statusCode,
			duration: duration ? `${duration}ms` : undefined,
		}

		let icon = '📥'
		if (statusCode) {
			if (statusCode >= 500) {
				icon = '❌'
				this.error(
					`${icon} ${method} ${url} - IP: ${ip} - Status: ${statusCode} - ${duration}ms`,
					undefined,
					'HTTP',
					requestData
				)
			} else if (statusCode >= 400) {
				icon = '⚠️'
				this.warn(
					`${icon} ${method} ${url} - IP: ${ip} - Status: ${statusCode} - ${duration}ms`,
					'HTTP',
					requestData
				)
			} else {
				icon = '📤'
				this.log(
					`${icon} ${method} ${url} - IP: ${ip} - Status: ${statusCode} - ${duration}ms`,
					'HTTP'
				)
			}
		} else {
			// Входящий запрос без статус-кода
			this.log(`${icon} ${method} ${url} - IP: ${ip}`, 'HTTP', requestData)
		}
	}

	/**
	 * Логирование результата операции с API
	 */
	logApiResponse(method: string, url: string, response: any, duration: number) {
		const success = response && response.success === true

		const metadata = {
			method,
			url,
			response,
			duration: `${duration}ms`,
		}

		const statusIcon = success ? '✅' : '❌'

		if (success) {
			this.log(
				`${statusIcon} API Response: ${method} ${url} - Success: ${success} - ${duration}ms`,
				'API',
				metadata
			)
		} else {
			this.error(
				`${statusIcon} API Response: ${method} ${url} - Success: ${success} - ${duration}ms`,
				undefined,
				'API',
				metadata
			)
		}
	}
}
