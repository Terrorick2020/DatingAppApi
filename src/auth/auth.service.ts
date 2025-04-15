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
		return successResponse(photo, 'Фото временно сохранено')
	}

	async register(dto: CreateAuthDto) {
		try {
			return await this.prisma.$transaction(async tx => {
				const user = await tx.user.create({
					data: {
						telegramId: dto.telegramId,
						name: dto.name,
						town: dto.town,
						sex: dto.sex,
						age: dto.age,
						bio: dto.bio,
						lang: dto.lang,
						geo: dto.geo,
						isVerify: false,
						findRequest: dto.findRequest,
						role: dto.role,
						status: dto.status,
					},
				})

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

				return successResponse(user, 'Пользователь создан и фото привязаны')
			})
		} catch (error) {
			return errorResponse('Ошибка при регистрации пользователя:', error)
		}
	}
}
