import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
	errorResponse,
	successResponse,
} from '../common/helpers/api.response.helper'
import { UserService } from '../user/user.service'
import { CreateAuthDto } from './dto/create-auth.dto'
import { UploadPhotoInternalDto } from './dto/upload-photo-internal.dto'
import { CheckAuthDto } from './dto/check-auth.dto'
import { v4 as uuidv4 } from 'uuid'
import { AppLogger } from '../common/logger/logger.service'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class AuthService {
	private readonly CONTEXT = 'AuthService'

	constructor(
		private prisma: PrismaService,
		private userService: UserService,
		private logger: AppLogger,
		private redisService: RedisService
	) {}

	async check(checkAuthDto: CheckAuthDto) {
		const telegramId = checkAuthDto.telegramId
		try {
			this.logger.debug(
				`Проверка пользователя с telegramId: ${telegramId}`,
				this.CONTEXT
			)

			// Проверяем кэш в Redis
			const cacheKey = `user:${telegramId}:status`
			const cachedStatus = await this.redisService.getKey(cacheKey)

			if (cachedStatus.success && cachedStatus.data) {
				this.logger.debug(
					`Пользователь ${telegramId} найден в кэше со статусом: ${cachedStatus.data}`,
					this.CONTEXT
				)

				return successResponse(
					cachedStatus.data,
					cachedStatus.data === 'None'
						? 'Пользователь не зарегистрирован'
						: 'Пользователь найден'
				)
			}

			// Если нет в кэше, ищем в БД
			const status = await this.userService.checkTgID(telegramId)

			// Проверяем, что статус - это строка перед сохранением в Redis
			if (typeof status === 'string') {
				// Кэшируем результат на 5 минут
				const cacheTTL = 300 // 5 минут
				await this.redisService.setKey(cacheKey, status, cacheTTL)

				if (status === 'None') {
					this.logger.debug(
						`Пользователь ${telegramId} не зарегистрирован`,
						this.CONTEXT
					)
					return successResponse(status, 'Пользователь не зарегистрирован')
				}

				this.logger.debug(
					`Пользователь ${telegramId} найден со статусом: ${status}`,
					this.CONTEXT
				)

				return successResponse(status, 'Пользователь найден')
			} else if (typeof status === 'object' && 'success' in status) {
				// Если вернулся объект ApiResponse, возвращаем его напрямую
				return status
			} else {
				// Если тип не распознан, возвращаем ошибку
				return errorResponse('Некорректный формат статуса пользователя')
			}
		} catch (error: any) {
			this.logger.error(
				`Ошибка при проверке пользователя ${telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ error }
			)
			return errorResponse('Ошибка при проверке пользователя:', error)
		}
	}

	async uploadPhoto(dto: UploadPhotoInternalDto) {
		try {
			this.logger.debug(
				`Загрузка фото для пользователя ${dto.telegramId}`,
				this.CONTEXT,
				{ photoKey: dto.key }
			)

			const photo = await this.prisma.photo.create({
				data: {
					key: dto.key,
					tempTgId: dto.telegramId,
				},
			})

			this.logger.debug(
				`Фото успешно сохранено с ID: ${photo.id}`,
				this.CONTEXT
			)

			return successResponse({ photoId: photo.id }, 'Фото временно сохранено')
		} catch (error: any) {
			this.logger.error(
				`Ошибка при загрузке фото для пользователя ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{ dto, error }
			)
			return errorResponse('Ошибка при загрузке фото:', error)
		}
	}

	async register(dto: CreateAuthDto) {
		try {
			this.logger.debug(
				`Начало регистрации пользователя: ${dto.telegramId}`,
				this.CONTEXT
			)

			return await this.prisma.$transaction(async tx => {
				const {
					telegramId,
					photoIds,
					invitedByReferralCode,
					interestId,
					...userData
				} = dto

				// Проверяем существование пользователя
				const existingUser = await tx.user.findUnique({
					where: { telegramId },
				})

				if (existingUser) {
					this.logger.warn(
						`Попытка повторной регистрации пользователя ${telegramId}`,
						this.CONTEXT
					)
					return errorResponse('Пользователь уже существует')
				}

				// Проверяем наличие фотографий
				this.logger.debug(
					`Проверка фотографий: ${photoIds.join(', ')}`,
					this.CONTEXT
				)

				const photos = await tx.photo.findMany({
					where: { id: { in: photoIds } },
				})

				if (photos.length !== photoIds.length) {
					const foundIds = photos.map(p => p.id)
					const missingIds = photoIds.filter(id => !foundIds.includes(id))

					this.logger.warn(
						`Не найдены фотографии: ${missingIds.join(', ')}`,
						this.CONTEXT,
						{ missingIds }
					)

					return errorResponse('Некоторые фотографии не найдены в базе данных')
				}

				const interest = await tx.interest.findUnique({
					where: { id: interestId },
				})
				const interests = await tx.interest.findMany()
				console.log(interestId, interest, interests)

				if (!interest) {
					this.logger.warn(
						`Указан несуществующий интерес: ${interestId}`,
						this.CONTEXT
					)
					return errorResponse('Выбранный интерес не существует')
				}

				// Обработка реферального кода
				let invitedById: string | undefined = undefined
				if (invitedByReferralCode) {
					this.logger.debug(
						`Проверка реферального кода: ${invitedByReferralCode}`,
						this.CONTEXT
					)

					const inviter = await tx.user.findUnique({
						where: { referralCode: invitedByReferralCode },
					})

					if (inviter) {
						invitedById = inviter.telegramId
						this.logger.debug(
							`Пользователь приглашен по коду от: ${invitedById}`,
							this.CONTEXT
						)
					} else {
						this.logger.warn(
							`Указан недействительный реферальный код: ${invitedByReferralCode}`,
							this.CONTEXT
						)
					}
				}

				// Создаем уникальный реферальный код
				const referralCode = uuidv4().slice(0, 8)

				this.logger.debug(
					`Создание пользователя с реферальным кодом: ${referralCode}`,
					this.CONTEXT,
					{ userData }
				)

				// Создаем пользователя
				try {
					const createdUser = await tx.user.create({
						data: {
							...userData,
							telegramId,
							referralCode,
							interest: { connect: { id: interestId } },
							photos: {
								connect: photoIds.map(id => ({ id })),
							},
							...(invitedById !== undefined
								? { invitedBy: { connect: { telegramId: invitedById } } }
								: {}),
						},
					})

					this.logger.debug(
						`Пользователь ${telegramId} успешно создан`,
						this.CONTEXT
					)
				} catch (createError: any) {
					this.logger.error(
						`Ошибка при создании пользователя ${telegramId}`,
						createError?.stack,
						this.CONTEXT,
						{
							error: createError,
							prismaCode: createError?.code,
							prismaClientVersion: createError?.clientVersion,
							prismaInfo: createError?.meta,
						}
					)

					throw createError
				}

				// Обновляем связи фотографий
				try {
					await tx.photo.updateMany({
						where: {
							tempTgId: telegramId,
							telegramId: null,
						},
						data: {
							telegramId,
							tempTgId: null,
						},
					})

					this.logger.debug(
						`Фотографии успешно привязаны к пользователю ${telegramId}`,
						this.CONTEXT
					)
				} catch (photoError: any) {
					this.logger.error(
						`Ошибка при привязке фотографий к пользователю ${telegramId}`,
						photoError?.stack,
						this.CONTEXT,
						{ error: photoError }
					)

					throw photoError
				}

				return successResponse('Пользователь создан и фото привязаны')
			})
		} catch (error: any) {
			// Детализируем ошибку в зависимости от её типа
			let errorMessage = 'Ошибка при регистрации пользователя:'
			let errorDetails = error

			// Обработка ошибок Prisma
			if (error?.name === 'PrismaClientKnownRequestError') {
				switch (error.code) {
					case 'P2002':
						errorMessage = 'Пользователь с таким идентификатором уже существует'
						break
					case 'P2003':
						errorMessage =
							'Указаны некорректные связи (foreign key constraint failed)'
						break
					case 'P2025':
						errorMessage = 'Запись не найдена (указан несуществующий ID)'
						break
					default:
						errorMessage = `Ошибка базы данных (код ${error.code})`
				}
			} else if (error?.name === 'PrismaClientValidationError') {
				errorMessage = 'Ошибка валидации данных:'
			}

			this.logger.error(
				`Ошибка при регистрации пользователя: ${dto.telegramId}`,
				error?.stack,
				this.CONTEXT,
				{
					dto,
					error,
					errorName: error?.name,
					prismaCode: error?.code,
					prismaClientVersion: error?.clientVersion,
					prismaInfo: error?.meta,
				}
			)

			return errorResponse(errorMessage, errorDetails)
		}
	}
}
