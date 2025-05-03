import {
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	Inject,
} from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { AppLogger } from '../common/logger/logger.service'
import { ClientProxy } from '@nestjs/microservices'
import { v4 } from 'uuid'
import {
	successResponse,
	errorResponse,
} from '@/common/helpers/api.response.helper'
import { CreateComplaintDto } from './dto/create-complaint.dto'
import { UpdateComplaintDto } from './dto/update-complaint.dto'
import { GetComplaintsDto } from './dto/get-complaints.dto'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import { ConnectionStatus } from '@/common/abstract/micro/micro.type'
import {
	ComplaintStatus,
	ComplaintType,
	SendComplaintTcpPatterns,
} from './complaint.types'
import * as cron from 'node-cron'

@Injectable()
export class ComplaintService implements OnModuleInit, OnModuleDestroy {
	private readonly COMPLAINT_TTL = 86400 * 60 // 60 дней в секундах
	private readonly CACHE_TTL = 1800 // 30 минут в секундах для кэша
	private cleanupTask: cron.ScheduledTask | null = null
	private readonly lockKey = 'complaint_cleanup_lock'
	private readonly lockDuration = 600 // 10 минут блокировки для очистки
	private readonly CONTEXT = 'ComplaintService'

	constructor(
		private readonly prisma: PrismaService,
		private readonly redisService: RedisService,
		private readonly logger: AppLogger,
		@Inject('COMPLAINT_SERVICE') private readonly wsClient: ClientProxy
	) {}

	/**
	 * Инициализация сервиса жалоб
	 */
	async onModuleInit() {
		// Задача очистки старых жалоб (архивация)
		this.cleanupTask = cron.schedule('0 0 * * *', async () => {
			try {
				await this.runComplaintCleanupWithLock()
			} catch (error: any) {
				this.logger.error(
					'Ошибка при очистке устаревших жалоб',
					error?.stack,
					this.CONTEXT,
					{ error }
				)
			}
		})
		this.logger.log('Задача очистки жалоб инициализирована', this.CONTEXT)
	}

	/**
	 * Корректное завершение работы сервиса
	 */
	onModuleDestroy() {
		if (this.cleanupTask) {
			this.cleanupTask.stop()
			this.logger.log('Задача очистки жалоб остановлена', this.CONTEXT)
		}
	}

	/**
	 * Создание новой жалобы
	 */
	async createComplaint(createDto: CreateComplaintDto): Promise<any> {
		try {
			const {
				fromUserId,
				reportedUserId,
				type,
				description,
				reportedContentId,
			} = createDto

			this.logger.debug(
				`Создание жалобы от ${fromUserId} на ${reportedUserId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователей
			const [reporter, reported] = await Promise.all([
				this.prisma.user.findUnique({
					where: { telegramId: fromUserId, status: { not: 'Blocked' } },
					select: { telegramId: true },
				}),
				this.prisma.user.findUnique({
					where: { telegramId: reportedUserId },
					select: { telegramId: true },
				}),
			])

			if (!reporter) {
				this.logger.warn(
					`Отправитель жалобы ${fromUserId} не найден или заблокирован`,
					this.CONTEXT
				)
				return errorResponse('Отправитель не найден или заблокирован')
			}

			if (!reported) {
				this.logger.warn(
					`Пользователь ${reportedUserId}, на которого жалуются, не найден`,
					this.CONTEXT
				)
				return errorResponse(
					'Пользователь, на которого вы жалуетесь, не найден'
				)
			}

			// Проверяем, не подавал ли уже пользователь жалобу на этого пользователя
			const existingComplaint = await this.prisma.complaint.findFirst({
				where: {
					fromUserId,
					toUserId: reportedUserId,
				},
			})

			if (existingComplaint) {
				this.logger.debug(
					`Жалоба от ${fromUserId} на ${reportedUserId} уже существует`,
					this.CONTEXT
				)
				return errorResponse('Вы уже подавали жалобу на этого пользователя')
			}

			// Находим или создаем причину жалобы
			let reasonId: number

			try {
				const reason = await this.prisma.complaintReason.findFirst({
					where: { value: type },
				})

				if (reason) {
					reasonId = reason.id
				} else {
					// Если причины нет, создаем новую (для типа OTHER)
					const newReason = await this.prisma.complaintReason.create({
						data: {
							id: Math.floor(Math.random() * 1000) + 100, // Генерируем случайный ID
							value: type,
							label: type, // Используем тип как метку
						},
					})
					reasonId = newReason.id
				}
			} catch (error: any) {
				this.logger.error(
					`Ошибка при поиске/создании причины жалобы`,
					error?.stack,
					this.CONTEXT,
					{ type, error }
				)
				return errorResponse('Ошибка при обработке причины жалобы')
			}

			// Создаем новую жалобу
			const complaint = await this.prisma.complaint.create({
				data: {
					reasonId,
					fromUserId,
					toUserId: reportedUserId,
				},
			})

			// Сохраняем дополнительные данные в Redis
			const complaintKey = `complaint:${complaint.id}`
			await this.redisService.setKey(
				complaintKey,
				JSON.stringify({
					id: complaint.id,
					status: ComplaintStatus.PENDING,
					type,
					description,
					reportedContentId,
					createdAt: Date.now(),
				}),
				this.COMPLAINT_TTL
			)

			// Инвалидируем кэш жалоб
			await this.invalidateComplaintsCache(fromUserId)
			await this.invalidateComplaintsCache(reportedUserId)

			// Отправляем уведомление через WebSocket для админов
			this.notifyAdminsAboutNewComplaint({
				id: complaint.id.toString(),
				status: ComplaintStatus.PENDING,
				type: type as ComplaintType,
				fromUserId,
				reportedUserId,
				description,
				reportedContentId,
				createdAt: Date.now(),
			})

			this.logger.debug(`Жалоба #${complaint.id} успешно создана`, this.CONTEXT)

			return successResponse(
				{
					id: complaint.id,
					status: ComplaintStatus.PENDING,
					type,
					createdAt: Date.now(),
				},
				'Жалоба успешно создана'
			)
		} catch (error: any) {
			this.logger.error(
				`Ошибка при создании жалобы`,
				error?.stack,
				this.CONTEXT,
				{ dto: createDto, error }
			)
			return errorResponse('Ошибка при создании жалобы', error)
		}
	}

	/**
	 * Обновление статуса жалобы
	 */
	async updateComplaint(updateDto: UpdateComplaintDto): Promise<any> {
		try {
			const { complaintId, status, resolutionNotes, telegramId } = updateDto

			this.logger.debug(
				`Обновление статуса жалобы #${complaintId} на ${status}`,
				this.CONTEXT
			)

			// Проверяем, что пользователь является админом
			const admin = await this.prisma.user.findUnique({
				where: { telegramId, role: 'Admin' },
				select: { telegramId: true },
			})

			if (!admin) {
				this.logger.warn(
					`Неадминистратор ${telegramId} пытается обновить жалобу`,
					this.CONTEXT
				)
				return errorResponse(
					'Только администраторы могут обновлять статус жалоб'
				)
			}

			// Проверяем существование жалобы
			const complaint = await this.prisma.complaint.findUnique({
				where: { id: parseInt(complaintId) },
				include: {
					fromUser: { select: { telegramId: true } },
					toUser: { select: { telegramId: true } },
				},
			})

			if (!complaint) {
				this.logger.warn(`Жалоба #${complaintId} не найдена`, this.CONTEXT)
				return errorResponse('Жалоба не найдена')
			}

			// Получаем текущие данные жалобы из Redis
			const complaintKey = `complaint:${complaintId}`
			const complaintDataResponse = await this.redisService.getKey(complaintKey)

			let complaintData: any = {
				status: ComplaintStatus.PENDING,
			}

			if (complaintDataResponse.success && complaintDataResponse.data) {
				try {
					complaintData = JSON.parse(complaintDataResponse.data)
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге данных жалобы #${complaintId}`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Обновляем данные жалобы
			complaintData.status = status
			complaintData.updatedAt = Date.now()

			if (resolutionNotes) {
				complaintData.resolutionNotes = resolutionNotes
			}

			// Сохраняем обновленные данные в Redis
			await this.redisService.setKey(
				complaintKey,
				JSON.stringify(complaintData),
				this.COMPLAINT_TTL
			)

			// Инвалидируем кэш жалоб
			await this.invalidateComplaintsCache(complaint.fromUser.telegramId)
			await this.invalidateComplaintsCache(complaint.toUser.telegramId)

			// Подготавливаем данные для ответа и уведомлений
			const responseData = {
				id: complaintId,
				status,
				updatedAt: complaintData.updatedAt,
				resolutionNotes: complaintData.resolutionNotes,
			}

			// Отправляем уведомление о смене статуса через WebSocket
			this.wsClient.emit(SendComplaintTcpPatterns.ComplaintStatusChanged, {
				...responseData,
				fromUserId: complaint.fromUser.telegramId,
				reportedUserId: complaint.toUser.telegramId,
			})

			this.logger.debug(
				`Статус жалобы #${complaintId} успешно обновлен на ${status}`,
				this.CONTEXT
			)

			return successResponse(responseData, 'Статус жалобы успешно обновлен')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при обновлении жалобы`,
				error?.stack,
				this.CONTEXT,
				{ dto: updateDto, error }
			)
			return errorResponse('Ошибка при обновлении жалобы', error)
		}
	}

	/**
	 * Получение жалоб
	 */
	async getComplaints(getDto: GetComplaintsDto): Promise<any> {
		try {
			const { telegramId, type } = getDto

			this.logger.debug(
				`Получение жалоб типа ${type} для пользователя ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем существование пользователя
			const user = await this.prisma.user.findUnique({
				where: { telegramId },
				select: { telegramId: true, role: true },
			})

			if (!user) {
				this.logger.warn(`Пользователь ${telegramId} не найден`, this.CONTEXT)
				return errorResponse('Пользователь не найден')
			}

			// Для жалоб "admin" пользователь должен быть админом
			if (type === 'admin' && user.role !== 'Admin') {
				this.logger.warn(
					`Неадминистратор ${telegramId} пытается получить админские жалобы`,
					this.CONTEXT
				)
				return errorResponse('Недостаточно прав для просмотра этих жалоб')
			}

			// Проверяем кэш
			const cacheKey = `user:${telegramId}:complaints:${type}`
			const cachedResponse = await this.redisService.getKey(cacheKey)

			if (cachedResponse.success && cachedResponse.data) {
				try {
					const cachedComplaints = JSON.parse(cachedResponse.data)
					this.logger.debug(
						`Получены кэшированные жалобы типа ${type} для пользователя ${telegramId}`,
						this.CONTEXT
					)
					return successResponse(cachedComplaints, 'Жалобы получены из кэша')
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге кэша жалоб для пользователя ${telegramId}`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Определяем условия для запроса жалоб
			let prismaWhere: any = {}

			switch (type) {
				case 'sent':
					prismaWhere = { fromUserId: telegramId }
					break
				case 'received':
					prismaWhere = { toUserId: telegramId }
					break
				case 'admin':
					// Для админов - все жалобы
					break
				default:
					return errorResponse('Неизвестный тип запроса жалоб')
			}

			// Получаем жалобы из базы данных
			const complaints = await this.prisma.complaint.findMany({
				where: prismaWhere,
				include: {
					reason: { select: { value: true, label: true } },
					fromUser: {
						select: {
							telegramId: true,
							name: true,
							photos: { take: 1, select: { key: true } },
						},
					},
					toUser: {
						select: {
							telegramId: true,
							name: true,
							photos: { take: 1, select: { key: true } },
						},
					},
				},
				orderBy: { createdAt: 'desc' },
			})

			// Получаем дополнительные данные из Redis
			const enrichedComplaints = await Promise.all(
				complaints.map(async complaint => {
					const complaintKey = `complaint:${complaint.id}`
					const complaintDataResponse =
						await this.redisService.getKey(complaintKey)

					let complaintData: any = {
						status: ComplaintStatus.PENDING,
					}

					if (complaintDataResponse.success && complaintDataResponse.data) {
						try {
							complaintData = JSON.parse(complaintDataResponse.data)
						} catch (e) {
							// Если ошибка парсинга, используем базовые данные
						}
					}

					return {
						id: complaint.id.toString(),
						fromUser: {
							telegramId: complaint.fromUser.telegramId,
							name: complaint.fromUser.name,
							avatar: complaint.fromUser.photos[0]?.key || '',
						},
						reportedUser: {
							telegramId: complaint.toUser.telegramId,
							name: complaint.toUser.name,
							avatar: complaint.toUser.photos[0]?.key || '',
						},
						type: complaint.reason.value,
						status: complaintData.status || ComplaintStatus.PENDING,
						description: complaintData.description || '',
						reportedContentId: complaintData.reportedContentId,
						createdAt: complaint.createdAt.getTime(),
						updatedAt: complaintData.updatedAt,
						resolutionNotes: complaintData.resolutionNotes,
					}
				})
			)

			// Кэшируем результат
			await this.redisService.setKey(
				cacheKey,
				JSON.stringify(enrichedComplaints),
				this.CACHE_TTL
			)

			this.logger.debug(
				`Получено ${enrichedComplaints.length} жалоб типа ${type} для пользователя ${telegramId}`,
				this.CONTEXT
			)

			return successResponse(enrichedComplaints, 'Жалобы успешно получены')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении жалоб`,
				error?.stack,
				this.CONTEXT,
				{ dto: getDto, error }
			)
			return errorResponse('Ошибка при получении жалоб', error)
		}
	}

	/**
	 * Получение статистики жалоб для админов
	 */
	async getComplaintStats(telegramId: string): Promise<any> {
		try {
			this.logger.debug(
				`Получение статистики жалоб для админа ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем, что пользователь является админом
			const admin = await this.prisma.user.findUnique({
				where: { telegramId, role: 'Admin' },
				select: { telegramId: true },
			})

			if (!admin) {
				this.logger.warn(
					`Неадминистратор ${telegramId} пытается получить статистику жалоб`,
					this.CONTEXT
				)
				return errorResponse('Недостаточно прав для просмотра статистики жалоб')
			}

			// Проверяем кэш
			const cacheKey = `admin:complaints:stats`
			const cachedResponse = await this.redisService.getKey(cacheKey)

			if (cachedResponse.success && cachedResponse.data) {
				try {
					const cachedStats = JSON.parse(cachedResponse.data)
					this.logger.debug(
						`Получены кэшированные статистики жалоб`,
						this.CONTEXT
					)
					return successResponse(
						cachedStats,
						'Статистика жалоб получена из кэша'
					)
				} catch (e) {
					this.logger.warn(
						`Ошибка при парсинге кэша статистики жалоб`,
						this.CONTEXT,
						{ error: e }
					)
				}
			}

			// Получаем общее количество жалоб
			const totalCount = await this.prisma.complaint.count()

			// Получаем количество жалоб по типам
			const reasonStats = await this.prisma.complaintReason.findMany({
				select: {
					value: true,
					label: true,
					_count: {
						select: { complaints: true },
					},
				},
			})

			// Получаем количество жалоб по статусам
			// Примечание: статусы хранятся в Redis, не в Prisma,
			// поэтому нужно использовать Redis для получения точной статистики

			// Преобразуем результаты
			const stats = {
				total: totalCount,
				byType: reasonStats.map(reason => ({
					type: reason.value,
					label: reason.label,
					count: reason._count.complaints,
				})),
				// Поскольку статусы хранятся в Redis, здесь будет заглушка
				// В реальном приложении нужно будет разработать более сложную логику
				byStatus: [
					{ status: ComplaintStatus.PENDING, count: 0 },
					{ status: ComplaintStatus.UNDER_REVIEW, count: 0 },
					{ status: ComplaintStatus.RESOLVED, count: 0 },
					{ status: ComplaintStatus.REJECTED, count: 0 },
				],
			}

			// Кэшируем результат
			await this.redisService.setKey(
				cacheKey,
				JSON.stringify(stats),
				this.CACHE_TTL
			)

			this.logger.debug(
				`Статистика жалоб успешно получена: всего ${totalCount} жалоб`,
				this.CONTEXT
			)

			return successResponse(stats, 'Статистика жалоб успешно получена')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при получении статистики жалоб`,
				error?.stack,
				this.CONTEXT,
				{ telegramId, error }
			)
			return errorResponse('Ошибка при получении статистики жалоб', error)
		}
	}

	/**
	 * Вспомогательные методы
	 */

	/**
	 * Инвалидация кэша жалоб пользователя
	 */
	private async invalidateComplaintsCache(userId: string): Promise<void> {
		try {
			const cacheKeys = [
				`user:${userId}:complaints:sent`,
				`user:${userId}:complaints:received`,
				`admin:complaints:stats`,
			]

			for (const key of cacheKeys) {
				await this.redisService.deleteKey(key)
			}

			this.logger.debug(
				`Кэш жалоб для пользователя ${userId} инвалидирован`,
				this.CONTEXT
			)
		} catch (error) {
			this.logger.warn(`Ошибка при инвалидации кэша жалоб`, this.CONTEXT, {
				userId,
				error,
			})
		}
	}

	/**
	 * Уведомление админов о новой жалобе
	 */
	private async notifyAdminsAboutNewComplaint(
		complaintData: any
	): Promise<void> {
		try {
			// Находим всех админов
			const admins = await this.prisma.user.findMany({
				where: { role: 'Admin' },
				select: { telegramId: true },
			})

			// Отправляем уведомление каждому админу через WebSocket
			for (const admin of admins) {
				// Получаем комнату админа
				const adminRoomResponse = await this.redisService.getKey(
					`user:${admin.telegramId}:room`
				)

				if (adminRoomResponse.success && adminRoomResponse.data) {
					// Отправляем уведомление через WebSocket
					this.wsClient.emit(SendComplaintTcpPatterns.CreateComplaint, {
						roomName: adminRoomResponse.data,
						telegramId: admin.telegramId,
						...complaintData,
					})

					this.logger.debug(
						`Отправлено уведомление о новой жалобе админу ${admin.telegramId}`,
						this.CONTEXT
					)
				}
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при отправке уведомлений админам о новой жалобе`,
				error?.stack,
				this.CONTEXT,
				{ complaintData, error }
			)
		}
	}

	/**
	 * Выполнение задачи очистки жалоб с механизмом блокировки
	 */
	private async runComplaintCleanupWithLock(): Promise<void> {
		// Пытаемся получить блокировку
		const lockId = v4()
		const lockResult = await this.redisService.redis.set(
			this.lockKey,
			lockId,
			'EX',
			this.lockDuration,
			'NX'
		)

		if (!lockResult) {
			this.logger.log(
				'Задача очистки жалоб уже выполняется другим процессом',
				this.CONTEXT
			)
			return
		}

		try {
			this.logger.log('Начало задачи очистки устаревших жалоб', this.CONTEXT)

			// Архивация старых разрешенных/отклоненных жалоб
			// Реализация логики очистки...
		} finally {
			// Освобождаем блокировку
			try {
				const script = `
                    if redis.call("get", KEYS[1]) == ARGV[1] then
                        return redis.call("del", KEYS[1])
                    else
                        return 0
                    end
                `
				await this.redisService.redis.eval(script, 1, this.lockKey, lockId)
				this.logger.debug('Блокировка очистки жалоб освобождена', this.CONTEXT)
			} catch (error: any) {
				this.logger.error(
					'Ошибка при освобождении блокировки очистки жалоб',
					error?.stack,
					this.CONTEXT,
					{ error: error }
				)
			}
		}
	}
}
