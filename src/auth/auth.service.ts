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

@Injectable()
export class AuthService {
	constructor(
		private prisma: PrismaService,
		private userService: UserService
	) {}

	async check(createAuthDto: CheckAuthDto) {
		const telegramId = createAuthDto.telegramId
		try {
			const status = await this.userService.checkTgID(telegramId)
			if (status === 'None') {
				return successResponse(status, 'Пользователь не зарегистрирован')
			}
			return successResponse(status, 'Пользователь найден')
		} catch (error) {
			return errorResponse('Ошибка при проверке пользователя:', error)
		}
	}

	async uploadPhoto(dto: UploadPhotoInternalDto) {
		const photo = await this.prisma.photo.create({
			data: {
				key: dto.key,
				telegramId: dto.telegramId,
			},
		})
		return successResponse({ photoId: photo.id }, 'Фото временно сохранено')
	}

	async register(dto: CreateAuthDto) {
		try {
			return await this.prisma.$transaction(async tx => {
				const existingUser = await tx.user.findUnique({
					where: { telegramId: dto.telegramId },
				})

				if (existingUser) {
					console.log('Пользователь уже существует:', existingUser)
					return errorResponse('Пользователь уже существует')
				}

				const { photoIds, ...userData } = dto

				const photos = await tx.photo.findMany({
					where: { id: { in: photoIds } },
				})

				if (photos.length !== photoIds.length) {
					return errorResponse('Некоторые фотографии не найдены в базе данных')
				}

				const user = await tx.user.create({
					data: {
						...userData,
						photos: {
							connect: photoIds.map(id => ({ id: Number(id) })),
						},
					},
				})

				console.log('Пользователь успешно создан:', user)

				await tx.photo.updateMany({
					where: {
						telegramId: dto.telegramId,
						userId: null,
					},
					data: {
						userId: user.id,
						telegramId: null,
					},
				})

				return successResponse('Пользователь создан и фото привязаны')
			})
		} catch (error) {
			console.error('Ошибка при регистрации пользователя:', error)
			return errorResponse('Ошибка при регистрации пользователя:', error)
		}
	}
}
